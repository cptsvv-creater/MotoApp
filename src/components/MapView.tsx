import { useEffect, useRef } from 'react'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

/** Темна безкоштовна мапа без ключів і реєстрацій. */
const STYLE_URL = 'https://tiles.openfreemap.org/styles/fiord'

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
}

export function MapView({
  track,
  me,
  follow = false,
  fit = false,
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

  useEffect(() => {
    if (!container.current || map.current) return
    const m = new maplibregl.Map({
      container: container.current,
      style: STYLE_URL,
      center: me ? [me.lng, me.lat] : [30.52, 50.45],
      zoom: me ? 15 : 5,
      attributionControl: { compact: true },
    })
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    m.on('load', () => {
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

  useEffect(updateTrack, [track])

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

  return <div ref={container} className="map" />
}
