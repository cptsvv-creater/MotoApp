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
  /** Довге натискання пальцем по карті: обрати точку призначення */
  onLongPress?: (coords: [number, number]) => void
}

export function MapView({
  track,
  me,
  follow = false,
  fit = false,
  zoomButtons = false,
  route = null,
  destination = null,
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
  const destMarker = useRef<maplibregl.Marker | null>(null)

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
    })

    // Довге натискання по карті — поставити точку призначення. MapLibre
    // віддає це подією contextmenu і на пальці, і на правій кнопці миші.
    m.on('contextmenu', (e) => {
      onLongPressRef.current?.([e.lngLat.lng, e.lngLat.lat])
    })

    // Якщо за 15 секунд карта так і не завантажилась — краще сказати
    // про це прямо, ніж лишати райдера дивитись у порожній прямокутник.
    const failTimer = setTimeout(() => {
      if (!m.isStyleLoaded()) onTilesFailedRef.current?.(true)
    }, 15_000)
    m.on('load', () => {
      clearTimeout(failTimer)
      onTilesFailedRef.current?.(false)
    })

    // Щойно користувач сам крутнув карту — камера більше не смикає її назад.
    const userMoved = (e: { originalEvent?: unknown }) => {
      if (e.originalEvent) onUserMoveRef.current?.()
    }
    m.on('dragstart', userMoved)
    m.on('zoomstart', userMoved)
    m.on('rotatestart', userMoved)
    map.current = m
    if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__map = m
    return () => {
      clearTimeout(failTimer)
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

  // Маркер райдера
  useEffect(() => {
    const m = map.current
    if (!m || !me) return
    if (!marker.current) {
      const el = document.createElement('div')
      el.className = 'me-marker'
      marker.current = new maplibregl.Marker({ element: el }).setLngLat([me.lng, me.lat]).addTo(m)
    } else {
      marker.current.setLngLat([me.lng, me.lat])
    }
    if (!follow) return
    // Наближаємо один раз, на першій позиції. Далі тільки тримаємо
    // райдера в центрі, а масштаб лишається таким, як його поставив
    // користувач — інакше кожне оновлення GPS відкидало б щіпок назад.
    if (!zoomedIn.current) {
      m.easeTo({ center: [me.lng, me.lat], zoom: 15, duration: 0 })
      zoomedIn.current = true
      return
    }
    m.easeTo({ center: [me.lng, me.lat], duration: 800 })
  }, [me, follow])

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
