import type { TrackPoint } from '../db'

/** Відстань між двома точками в метрах (формула гаверсинуса). */
export function haversine(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(bLat - aLat)
  const dLng = toRad(bLng - aLng)
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} м`
  return `${(meters / 1000).toFixed(1)} км`
}

export function formatDuration(ms: number): string {
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

/** м/с -> км/год */
export function kmh(ms: number | null | undefined): number {
  if (ms == null || !isFinite(ms) || ms < 0) return 0
  return ms * 3.6
}

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleString('uk-UA', {
    day: '2-digit',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function toLineString(points: TrackPoint[]): [number, number][] {
  return points.map((p) => [p.lng, p.lat])
}

export function boundsOf(points: TrackPoint[]) {
  if (points.length === 0) return null
  let minLng = Infinity
  let minLat = Infinity
  let maxLng = -Infinity
  let maxLat = -Infinity
  for (const p of points) {
    if (p.lng < minLng) minLng = p.lng
    if (p.lat < minLat) minLat = p.lat
    if (p.lng > maxLng) maxLng = p.lng
    if (p.lat > maxLat) maxLat = p.lat
  }
  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ] as [[number, number], [number, number]]
}
