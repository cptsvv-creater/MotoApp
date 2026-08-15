import { useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import type { TrackPoint } from '../db'
import type { Telemetry } from '../lib/telemetry'
import { formatDate, haversine } from '../lib/geo'

/**
 * Проліт над маршрутом: камера летить треком у 3D, під нею — справжній
 * рельєф, позаду тягнеться пройдений шлях. Усі цифри поїздки лишаються
 * на екрані, але по кутах, щоб не затуляти краєвид.
 */

const STYLE_URL = 'https://tiles.openfreemap.org/styles/fiord'
/** Рельєф світу, безкоштовно і без ключів. Кодування terrarium. */
const DEM_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'
/** Скільки триває проліт незалежно від довжини поїздки. */
const BASE_SECONDS = 45

interface Frame {
  lng: number
  lat: number
  distance: number
  speed: number
  lean: number
  alt: number | null
  t: number
}

export function FlyoverScreen({
  points,
  telemetry,
  title,
  startedAt,
  onClose,
}: {
  points: TrackPoint[]
  telemetry: Telemetry
  title: string
  startedAt: number
  onClose: () => void
}) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const frames = useRef<Frame[]>([])
  const rider = useRef<maplibregl.Marker | null>(null)
  const raf = useRef<number | null>(null)
  const progressRef = useRef(0)
  const playingRef = useRef(true)

  const [playing, setPlaying] = useState(true)
  const [ready, setReady] = useState(false)
  const [hud, setHud] = useState({ speed: 0, lean: 0, distance: 0, alt: 0, progress: 0 })

  // Готуємо кадри: до кожної точки треку підбираємо швидкість і нахил.
  if (frames.current.length === 0 && points.length > 1) {
    let distance = 0
    frames.current = points.map((p, i) => {
      if (i > 0) distance += haversine(points[i - 1].lat, points[i - 1].lng, p.lat, p.lng)
      const s = nearestSample(telemetry, p.t)
      return {
        lng: p.lng,
        lat: p.lat,
        distance,
        speed: s?.speed ?? (p.speed != null ? p.speed * 3.6 : 0),
        lean: s?.lean ?? 0,
        alt: p.alt,
        t: p.t,
      }
    })
  }

  const total = frames.current[frames.current.length - 1]?.distance ?? 0
  // Короткій поїздці потрібен ближчий кадр, довгій — ширший, інакше
  // на одній трек не влізе, а на іншій буде ледь помітною ниткою.
  // Ближче за 15 камера в горах пірнає в схил і кадр глухне.
  const flightZoom = total < 3000 ? 15 : total < 15000 ? 14.7 : 14.2
  const duration = Math.min(90, Math.max(25, BASE_SECONDS * (total > 0 ? 1 : 0))) * 1000

  useEffect(() => {
    if (!container.current || map.current || frames.current.length < 2) return

    const first = frames.current[0]
    const m = new maplibregl.Map({
      container: container.current,
      style: STYLE_URL,
      center: [first.lng, first.lat],
      zoom: 14,
      pitch: 60,
      bearing: bearingAt(frames.current, 0),
      attributionControl: { compact: true },
      // Рельєф читає висоти з картинки — без цього прапорця не працює.
      maxPitch: 80,
    })
    map.current = m

    m.on('load', () => {
      m.addSource('dem', {
        type: 'raster-dem',
        tiles: [DEM_URL],
        tileSize: 256,
        maxzoom: 13,
        encoding: 'terrarium',
      })
      m.setTerrain({ source: 'dem', exaggeration: 1.6 })

      // Сама лише геометрія рельєфу на рівному за кольором стилі майже
      // не читається — гори проявляє світлотінь.
      m.addLayer({
        id: 'hillshade',
        type: 'hillshade',
        source: 'dem',
        paint: {
          // Приглушено: яскрава світлотінь вибілює схили, і трек на них губиться.
          'hillshade-exaggeration': 0.45,
          'hillshade-shadow-color': '#04060b',
          'hillshade-highlight-color': '#6e819a',
          'hillshade-accent-color': '#16202e',
        },
      })

      try {
        m.setSky({
          'sky-color': '#0d1b2a',
          'horizon-color': '#2a3d55',
          'fog-color': '#0a0a0c',
          'fog-ground-blend': 0.6,
          'horizon-fog-blend': 0.6,
        })
      } catch {
        // Старіші версії неба не мають — не критично.
      }

      const all = frames.current.map((f) => [f.lng, f.lat])
      m.addSource('flight-full', {
        type: 'geojson',
        data: lineFeature(all),
      })
      m.addSource('flight-done', { type: 'geojson', data: lineFeature([]) })

      m.addLayer({
        id: 'flight-full',
        type: 'line',
        source: 'flight-full',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#5a5a68', 'line-width': 3, 'line-opacity': 0.7 },
      })
      m.addLayer({
        id: 'flight-glow',
        type: 'line',
        source: 'flight-done',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#ff7a2f', 'line-width': 18, 'line-opacity': 0.45, 'line-blur': 10 },
      })
      m.addLayer({
        id: 'flight-done',
        type: 'line',
        source: 'flight-done',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#ffb37a', 'line-width': 6 },
      })

      // Мітка райдера — вістря, що лежить на землі й дивиться за рухом.
      // pitchAlignment 'map' кладе її на рельєф, а не тримає стійма.
      const el = document.createElement('div')
      el.className = 'rider-arrow'
      el.innerHTML =
        '<svg viewBox="0 0 24 24" width="34" height="34">' +
        '<path d="M12 2 L20 21 L12 16.5 L4 21 Z" fill="#ff7a2f" stroke="#0a0a0c" stroke-width="1.5" stroke-linejoin="round"/>' +
        '</svg>'
      rider.current = new maplibregl.Marker({
        element: el,
        rotationAlignment: 'map',
        pitchAlignment: 'map',
      })
        .setLngLat([first.lng, first.lat])
        .addTo(m)

      setReady(true)
    })

    return () => {
      if (raf.current) cancelAnimationFrame(raf.current)
      m.remove()
      map.current = null
    }
  }, [])

  // Сам політ: рухаємось рівномірно за пройденою відстанню.
  useEffect(() => {
    if (!ready) return
    let last = performance.now()
    // Поточний нахил камери змінюємо плавно, а не стрибком.
    let pitch = 63

    function step(now: number) {
      const m = map.current
      if (!m) return
      const dt = now - last
      last = now

      if (playingRef.current) {
        progressRef.current = Math.min(1, progressRef.current + dt / duration)
      }

      const p = progressRef.current
      const at = sampleAt(frames.current, p * total)
      const bearing = bearingAt(frames.current, p)

      // Камера стоїть позаду райдера. Якщо там гребінь вищий за нього,
      // трек ховається за горою — тоді розпрямляємо камеру, щоб вона
      // дивилась згори і бачила шлях поверх хребта.
      const ridge = ridgeBehind(m, at.lng, at.lat, bearing)
      const targetPitch = ridge > 45 ? 38 : ridge > 18 ? 50 : 63
      pitch += (targetPitch - pitch) * 0.04

      m.jumpTo({
        center: [at.lng, at.lat],
        zoom: flightZoom,
        pitch,
        bearing,
        // Точка райдера трохи вище центра: тоді пройдений шлях, який
        // лишається позаду, видно в нижній частині кадру.
        padding: { top: 0, bottom: 220, left: 0, right: 0 },
      })

      rider.current?.setLngLat([at.lng, at.lat]).setRotation(bearing)

      const done = frames.current.filter((f) => f.distance <= p * total).map((f) => [f.lng, f.lat])
      if (done.length > 1) {
        ;(m.getSource('flight-done') as maplibregl.GeoJSONSource)?.setData(lineFeature(done))
      }

      setHud({
        speed: at.speed,
        lean: at.lean,
        distance: p * total,
        alt: at.alt ?? 0,
        progress: p,
      })

      if (p >= 1) playingRef.current = false
      raf.current = requestAnimationFrame(step)
    }

    raf.current = requestAnimationFrame(step)
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current)
    }
  }, [ready, duration, total])

  function toggle() {
    if (progressRef.current >= 1) progressRef.current = 0
    playingRef.current = !playingRef.current
    setPlaying(playingRef.current)
  }

  return (
    <div className="flyover">
      <div ref={container} className="flyover-map" />

      {!ready && <div className="flyover-loading">Готую політ…</div>}

      <div className="flyover-top">
        <div>
          <div className="flyover-title">{title || formatDate(startedAt)}</div>
          {/* Дату другим рядком лише тоді, коли зверху справжня назва. */}
          {title && <div className="flyover-sub">{formatDate(startedAt)}</div>}
        </div>
        <button className="flyover-close" onClick={onClose} aria-label="Закрити">
          ✕
        </button>
      </div>

      <div className="flyover-hud">
        <div className="fly-metric">
          <span className="fly-value">{Math.round(hud.speed)}</span>
          <span className="fly-label">км/год</span>
        </div>
        <div className="fly-metric">
          <span className="fly-value">{(hud.distance / 1000).toFixed(1)}</span>
          <span className="fly-label">км з {(total / 1000).toFixed(1)}</span>
        </div>
        <div className="fly-metric">
          <span className="fly-value" style={{ color: hud.lean < -3 ? '#3b93e0' : hud.lean > 3 ? '#e8631d' : undefined }}>
            {Math.abs(Math.round(hud.lean))}°
          </span>
          <span className="fly-label">{hud.lean < -3 ? 'ліворуч' : hud.lean > 3 ? 'праворуч' : 'рівно'}</span>
        </div>
        <div className="fly-metric">
          <span className="fly-value">{Math.round(hud.alt)}</span>
          <span className="fly-label">м над рівнем моря</span>
        </div>
      </div>

      <div className="flyover-controls">
        <button className="btn btn-primary" onClick={toggle}>
          {playing ? 'Пауза' : progressRef.current >= 1 ? 'Ще раз' : 'Продовжити'}
        </button>
        <div
          className="fly-progress"
          onPointerDown={(e) => {
            const box = e.currentTarget.getBoundingClientRect()
            progressRef.current = Math.min(1, Math.max(0, (e.clientX - box.left) / box.width))
          }}
        >
          <span style={{ width: `${hud.progress * 100}%` }} />
        </div>
      </div>
    </div>
  )
}

/**
 * Наскільки гребінь позаду райдера вищий за нього самого, у метрах.
 * Саме він і затуляє пройдений шлях, коли камера стоїть за горою.
 */
function ridgeBehind(m: maplibregl.Map, lng: number, lat: number, bearing: number): number {
  const here = m.queryTerrainElevation?.([lng, lat])
  if (here == null) return 0

  const back = ((bearing + 180) * Math.PI) / 180
  let highest = here
  for (const d of [150, 300, 450, 650]) {
    const lat2 = lat + (d * Math.cos(back)) / 111_320
    const lng2 = lng + (d * Math.sin(back)) / (111_320 * Math.cos((lat * Math.PI) / 180))
    const e = m.queryTerrainElevation?.([lng2, lat2])
    if (e != null && e > highest) highest = e
  }
  return highest - here
}

function lineFeature(coordinates: number[][]) {
  return {
    type: 'Feature' as const,
    properties: {},
    geometry: { type: 'LineString' as const, coordinates },
  }
}

function nearestSample(telemetry: Telemetry, t: number) {
  let best = null
  let bestDiff = Infinity
  for (const s of telemetry.samples) {
    const diff = Math.abs(s.t - t)
    if (diff < bestDiff) {
      bestDiff = diff
      best = s
    }
  }
  return best
}

/** Точка на треку за пройденою відстанню, з плавним переходом між кадрами. */
function sampleAt(frames: Frame[], distance: number): Frame {
  if (frames.length === 0) return { lng: 0, lat: 0, distance: 0, speed: 0, lean: 0, alt: 0, t: 0 }
  if (distance <= 0) return frames[0]
  const last = frames[frames.length - 1]
  if (distance >= last.distance) return last

  let i = 1
  while (i < frames.length && frames[i].distance < distance) i++
  const a = frames[i - 1]
  const b = frames[i]
  const span = b.distance - a.distance || 1
  const k = (distance - a.distance) / span
  return {
    lng: a.lng + (b.lng - a.lng) * k,
    lat: a.lat + (b.lat - a.lat) * k,
    distance,
    speed: a.speed + (b.speed - a.speed) * k,
    lean: a.lean + (b.lean - a.lean) * k,
    alt: (a.alt ?? 0) + ((b.alt ?? 0) - (a.alt ?? 0)) * k,
    t: a.t,
  }
}

/**
 * Курс камери, згладжений по ділянці попереду: інакше на кожному
 * тремтінні GPS камеру мотало б з боку в бік.
 */
function bearingAt(frames: Frame[], progress: number): number {
  if (frames.length < 2) return 0
  const total = frames[frames.length - 1].distance
  const here = progress * total
  const a = sampleAt(frames, Math.max(0, here - 25))
  const b = sampleAt(frames, Math.min(total, here + 60))
  const toRad = (d: number) => (d * Math.PI) / 180
  const φ1 = toRad(a.lat)
  const φ2 = toRad(b.lat)
  const Δλ = toRad(b.lng - a.lng)
  const y = Math.sin(Δλ) * Math.cos(φ2)
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  return (Math.atan2(y, x) * 180) / Math.PI
}
