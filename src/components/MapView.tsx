import { useEffect, useRef } from 'react'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

/** Темна безкоштовна мапа без ключів і реєстрацій. */
const STYLE_URL = 'https://tiles.openfreemap.org/styles/fiord'

// Показуємо карті, де лежить її фоновий воркер. Без цього рядка
// складальник губить файл воркера і карта лишається порожньою —
// див. scripts/copy-map-worker.mjs.
maplibregl.setWorkerUrl(`${import.meta.env.BASE_URL}maplibre/maplibre-gl-worker.mjs`)

interface Props {
  /** Пройдений маршрут: [lng, lat][] */
  track: [number, number][]
  /** Поточна позиція райдера */
  me?: { lng: number; lat: number; heading?: number | null } | null
  /** Тримати камеру на райдері */
  follow?: boolean
  /** 'north' — північ угорі, 'course' — карта крутиться за напрямком руху */
  orientation?: 'north' | 'course'
  /**
   * Наскільки опустити райдера нижче центру, у пікселях. У навігації
   * половина карти позаду не потрібна — потрібна дорога попереду.
   */
  lookAhead?: number
  /** Як поводиться масштаб: вручну, сам, чи від обраного райдером */
  zoomMode?: 'manual' | 'auto' | 'anchored'
  /** Масштаб, обраний райдером — відлік для режиму «від мого» */
  zoomAnchor?: number
  /** Поточна швидкість, км/год */
  speedKmh?: number
  /** Райдер сам крутнув масштаб — повідомляємо новий відлік */
  onUserZoom?: (zoom: number) => void
  /** Викликається, коли користувач сам посунув/масштабував карту */
  onUserMove?: () => void
  /** Повідомляє, що тайли карти так і не завантажились */
  onTilesFailed?: (failed: boolean) => void
  /** Вписати весь трек у екран (для перегляду збереженої поїздки) */
  fit?: boolean
  /** Показати великі кнопки масштабу під палець у рукавиці */
  zoomButtons?: boolean
  /** Прокладений маршрут: [lng, lat][] */
  route?: [number, number][] | null
  /** Куди їдемо — ставимо прапорець */
  destination?: [number, number] | null
  /** Інші райдери групи */
  riders?: Array<{ id: string; name: string; lng: number; lat: number }>
  /** Точка треку, яку зараз розглядають у телеметрії */
  highlight?: [number, number] | null
  /** Довге натискання пальцем по карті: обрати точку призначення */
  onLongPress?: (coords: [number, number]) => void
}

export function MapView({
  track,
  me,
  follow = false,
  orientation = 'north',
  lookAhead = 0,
  zoomMode = 'manual',
  zoomAnchor = 16,
  speedKmh = 0,
  onUserZoom,
  fit = false,
  zoomButtons = false,
  route = null,
  destination = null,
  riders = [],
  highlight = null,
  onLongPress,
  onUserMove,
  onTilesFailed,
}: Props) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const marker = useRef<maplibregl.Marker | null>(null)
  const ready = useRef(false)
  const fitted = useRef(false)
  const zoomedIn = useRef(false)
  const onUserMoveRef = useRef(onUserMove)
  onUserMoveRef.current = onUserMove
  const onTilesFailedRef = useRef(onTilesFailed)
  onTilesFailedRef.current = onTilesFailed
  const onLongPressRef = useRef(onLongPress)
  onLongPressRef.current = onLongPress
  const onUserZoomRef = useRef(onUserZoom)
  onUserZoomRef.current = onUserZoom
  const destMarker = useRef<maplibregl.Marker | null>(null)
  const riderMarkers = useRef<Map<string, maplibregl.Marker>>(new Map())
  const highlightMarker = useRef<maplibregl.Marker | null>(null)
  const cleanupHold = useRef<(() => void) | null>(null)
  const zoomModeRef = useRef(zoomMode)
  zoomModeRef.current = zoomMode
  /** Поки цей час не мине, автоматика масштабу мовчить. */
  const zoomSilentUntil = useRef(0)

  useEffect(() => {
    if (!container.current || map.current) return
    const m = new maplibregl.Map({
      container: container.current,
      style: STYLE_URL,
      center: me ? [me.lng, me.lat] : [30.52, 50.45],
      zoom: me ? 15 : 5,
      attributionControl: { compact: true },
    })
    // Штатні кнопки масштабу MapLibre маленькі й тиснуться у верхній кут,
    // куди в рукавиці не влучиш. Замість них — свої, великі, знизу.
    m.on('load', () => {
      // Маршрут малюємо першим, щоб пройдений трек лягав поверх нього.
      m.addSource('route', {
        type: 'geojson',
        data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] } },
      })
      m.addLayer({
        id: 'route-casing',
        type: 'line',
        source: 'route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#0b3d6b', 'line-width': 12, 'line-opacity': 0.9 },
      })
      m.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#4aa8ff', 'line-width': 6 },
      })

      m.addSource('track', {
        type: 'geojson',
        data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] } },
      })
      m.addLayer({
        id: 'track-glow',
        type: 'line',
        source: 'track',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#ff5c1a', 'line-width': 12, 'line-opacity': 0.18, 'line-blur': 6 },
      })
      m.addLayer({
        id: 'track-line',
        type: 'line',
        source: 'track',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#ff7a2f', 'line-width': 4.5 },
      })
      ready.current = true
      updateTrack()
      updateRoute()

      // Підпис карти обовʼязковий за ліцензією, але розгорнутим він
      // з'їдає нижню смугу екрана. Лишаємо кнопку «i» — текст за нею.
      m.getContainer()
        .querySelectorAll('.maplibregl-ctrl-attrib.maplibregl-compact-show')
        .forEach((el) => el.classList.remove('maplibregl-compact-show'))
    })

    // Довге натискання по карті — поставити точку призначення.
    // Подія contextmenu на iOS приходить не завжди, тому розпізнаємо самі:
    // палець лежить на місці понад пів секунди — це і є вибір точки.
    const canvas = m.getCanvasContainer()
    let holdTimer: ReturnType<typeof setTimeout> | null = null
    let startedAt: { x: number; y: number } | null = null

    const cancelHold = () => {
      if (holdTimer) clearTimeout(holdTimer)
      holdTimer = null
      startedAt = null
    }

    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      startedAt = { x: e.clientX, y: e.clientY }
      holdTimer = setTimeout(() => {
        if (!startedAt) return
        const box = canvas.getBoundingClientRect()
        const at = m.unproject([startedAt.x - box.left, startedAt.y - box.top])
        onLongPressRef.current?.([at.lng, at.lat])
        cancelHold()
      }, 550)
    }

    const onMove = (e: PointerEvent) => {
      // Посунув пальцем — це прокручування карти, а не вибір точки.
      if (!startedAt) return
      if (Math.hypot(e.clientX - startedAt.x, e.clientY - startedAt.y) > 12) cancelHold()
    }

    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerup', cancelHold)
    canvas.addEventListener('pointercancel', cancelHold)

    // Права кнопка миші — швидший шлях на комп'ютері.
    m.on('contextmenu', (e) => {
      onLongPressRef.current?.([e.lngLat.lng, e.lngLat.lat])
    })

    cleanupHold.current = () => {
      cancelHold()
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', cancelHold)
      canvas.removeEventListener('pointercancel', cancelHold)
    }

    // Якщо за 15 секунд карта так і не завантажилась — краще сказати
    // про це прямо, ніж лишати райдера дивитись у порожній прямокутник.
    const failTimer = setTimeout(() => {
      if (!m.isStyleLoaded()) onTilesFailedRef.current?.(true)
    }, 15_000)
    m.on('load', () => {
      clearTimeout(failTimer)
      onTilesFailedRef.current?.(false)
    })

    // Щойно користувач сам потягнув карту — камера більше не смикає її
    // назад. А от щіпок масштабу стеження не скасовує: наблизити й
    // далі їхати за собою — цілком нормальне бажання.
    const userMoved = (e: { originalEvent?: unknown }) => {
      if (e.originalEvent) onUserMoveRef.current?.()
    }
    m.on('dragstart', userMoved)
    m.on('rotatestart', userMoved)
    m.on('zoomend', (e: { originalEvent?: unknown }) => {
      if (!e.originalEvent) return
      // Райдер крутнув сам. У режимі «сама» замовкаємо на три хвилини,
      // щоб не скасовувати його вибір наступної ж секунди.
      if (zoomModeRef.current === 'auto') zoomSilentUntil.current = Date.now() + 180_000
      onUserZoomRef.current?.(m.getZoom())
    })
    map.current = m
    if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__map = m
    return () => {
      clearTimeout(failTimer)
      cleanupHold.current?.()
      m.remove()
      map.current = null
      ready.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function updateTrack() {
    const m = map.current
    if (!m || !ready.current) return
    const src = m.getSource('track') as maplibregl.GeoJSONSource | undefined
    src?.setData({
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: track },
    })
  }

  function updateRoute() {
    const m = map.current
    if (!m || !ready.current) return
    const src = m.getSource('route') as maplibregl.GeoJSONSource | undefined
    src?.setData({
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: route ?? [] },
    })
  }

  useEffect(updateTrack, [track])
  useEffect(updateRoute, [route])

  // Товариші по поїздці: своя мітка з підписом на кожного.
  useEffect(() => {
    const m = map.current
    if (!m) return
    const seen = new Set<string>()

    for (const r of riders) {
      seen.add(r.id)
      let marker = riderMarkers.current.get(r.id)
      if (!marker) {
        const el = document.createElement('div')
        el.className = 'rider-marker'
        el.innerHTML = `<span class="rider-dot"></span><span class="rider-name"></span>`
        marker = new maplibregl.Marker({ element: el }).setLngLat([r.lng, r.lat]).addTo(m)
        riderMarkers.current.set(r.id, marker)
      } else {
        marker.setLngLat([r.lng, r.lat])
      }
      const label = marker.getElement().querySelector('.rider-name')
      if (label) label.textContent = r.name
    }

    // Хто вийшов з групи — прибираємо з карти.
    for (const [id, marker] of riderMarkers.current) {
      if (!seen.has(id)) {
        marker.remove()
        riderMarkers.current.delete(id)
      }
    }
  }, [riders])

  // Мітка тієї точки, яку зараз розглядають у телеметрії.
  useEffect(() => {
    const m = map.current
    if (!m) return
    if (!highlight) {
      highlightMarker.current?.remove()
      highlightMarker.current = null
      return
    }
    if (!highlightMarker.current) {
      const el = document.createElement('div')
      el.className = 'scrub-marker'
      highlightMarker.current = new maplibregl.Marker({ element: el }).setLngLat(highlight).addTo(m)
    } else {
      highlightMarker.current.setLngLat(highlight)
    }
  }, [highlight])

  // Повернулись до «північ угорі» — вирівнюємо карту навіть без руху.
  useEffect(() => {
    const m = map.current
    if (!m || orientation !== 'north') return
    if (m.getBearing() !== 0) m.easeTo({ bearing: 0, duration: 500 })
  }, [orientation])

  // Прапорець на фініші
  useEffect(() => {
    const m = map.current
    if (!m) return
    if (!destination) {
      destMarker.current?.remove()
      destMarker.current = null
      return
    }
    if (!destMarker.current) {
      const el = document.createElement('div')
      el.className = 'dest-marker'
      el.textContent = '⚑'
      destMarker.current = new maplibregl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat(destination)
        .addTo(m)
    } else {
      destMarker.current.setLngLat(destination)
    }
  }, [destination])

  // Вписуємо весь трек у екран — один раз, коли точки зʼявились.
  useEffect(() => {
    const m = map.current
    if (!m || !ready.current || !fit || fitted.current || track.length < 2) return
    const bounds = track.reduce(
      (b, c) => b.extend(c),
      new maplibregl.LngLatBounds(track[0], track[0]),
    )
    m.fitBounds(bounds, { padding: 48, duration: 0 })
    fitted.current = true
  }, [track, fit])

  // Маркер райдера: стрілка, повернута за напрямком руху.
  useEffect(() => {
    const m = map.current
    if (!m || !me) return
    if (!marker.current) {
      const el = document.createElement('div')
      el.className = 'me-marker'
      el.innerHTML = '<span class="me-arrow">➤</span>'
      marker.current = new maplibregl.Marker({ element: el }).setLngLat([me.lng, me.lat]).addTo(m)
    } else {
      marker.current.setLngLat([me.lng, me.lat])
    }

    // Стрілку крутимо відносно карти: у режимі «за рухом» карта вже
    // повернута, тож стрілка має дивитись просто вгору.
    const arrow = marker.current.getElement().querySelector('.me-arrow') as HTMLElement | null
    if (arrow) {
      const heading = me.heading ?? 0
      const relative = orientation === 'course' ? 0 : heading
      arrow.style.transform = `rotate(${relative - 90}deg)`
      arrow.style.opacity = me.heading == null ? '0' : '1'
    }
    if (!follow) return

    // У режимі «за рухом» повертаємо карту носом уперед. Курс беремо
    // лише коли він є: на місці GPS його не знає, і карту б крутило.
    const bearing = orientation === 'course' && me.heading != null ? me.heading : 0

    // Наближаємо один раз, на першій позиції. Далі тільки тримаємо
    // райдера в центрі, а масштаб лишається таким, як його поставив
    // користувач — інакше кожне оновлення GPS відкидало б щіпок назад.
    // Відступ згори звужує область, у якій камера тримає центр, тож
    // райдер опускається в нижню частину кадру — а попереду лишається
    // більше дороги. Саме згори, не знизу: знизу підняло б його вгору.
    const padding = { top: lookAhead, bottom: 0, left: 0, right: 0 }

    // Масштаб рухаємо лише тоді, коли райдер сам дозволив це режимом
    // і поки не мовчимо після його власного щіпка.
    const wanted =
      Date.now() < zoomSilentUntil.current ? null : wantedZoom(zoomMode, zoomAnchor, speedKmh)
    const needsZoom = wanted != null && Math.abs(m.getZoom() - wanted) > 0.2

    if (!zoomedIn.current) {
      m.easeTo({
        center: [me.lng, me.lat],
        zoom: wanted ?? zoomAnchor,
        bearing,
        padding,
        duration: 0,
      })
      zoomedIn.current = true
      return
    }

    m.easeTo({
      center: [me.lng, me.lat],
      bearing,
      padding,
      ...(needsZoom ? { zoom: wanted } : {}),
      duration: 800,
    })
  }, [me, follow, orientation, lookAhead, zoomMode, zoomAnchor, speedKmh])

  return (
    <>
      <div ref={container} className="map" />
      {zoomButtons && (
        <div className="zoom-pad">
          <button onClick={() => map.current?.zoomIn({ duration: 300 })} aria-label="Наблизити">
            +
          </button>
          <button onClick={() => map.current?.zoomOut({ duration: 300 })} aria-label="Віддалити">
            −
          </button>
        </div>
      )}
    </>
  )
}

/**
 * Наскільки віддалити карту на цій швидкості. До 30 км/год — нітрохи
 * (місто, двори, розвороти), далі плавно до двох з половиною кроків
 * масштабу на трасі.
 */
export function zoomDrop(speedKmh: number): number {
  if (speedKmh <= 30) return 0
  if (speedKmh >= 110) return 2.5
  return ((speedKmh - 30) / 80) * 2.5
}

/** Який масштаб має бути зараз, або null — якщо це не наша справа. */
function wantedZoom(
  mode: 'manual' | 'auto' | 'anchored',
  anchor: number,
  speedKmh: number,
): number | null {
  if (mode === 'manual') return null
  // 'auto' веде відлік від власного значення, 'anchored' — від того,
  // що обрав райдер. Далі математика однакова.
  const base = mode === 'auto' ? 16.5 : anchor
  return base - zoomDrop(speedKmh)
}
