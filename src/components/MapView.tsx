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
  /** Вписати весь трек у екран (для перегляду збереженої поїздки) */
  fit?: boolean
}

export function MapView({ track, me, follow = false, fit = false }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const marker = useRef<maplibregl.Marker | null>(null)
  const ready = useRef(false)
  const fitted = useRef(false)

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
    map.current = m
    return () => {
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
    if (follow) m.easeTo({ center: [me.lng, me.lat], zoom: Math.max(m.getZoom(), 15), duration: 800 })
  }, [me, follow])

  return <div ref={container} className="map" />
}
