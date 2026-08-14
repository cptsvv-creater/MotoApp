import { haversine } from './geo'

/**
 * Погода з Open-Meteo — безкоштовно і без ключів. Для мотоцикліста
 * головне не температура, а чи не влетить він у дощ через годину,
 * тому дивимось прогноз саме вздовж маршруту й на час прибуття.
 */

export interface WeatherPoint {
  /** Скільки метрів від старту маршруту */
  atDistance: number
  /** Коли ми там будемо */
  at: number
  coords: [number, number]
  temp: number
  /** Опади, мм за годину */
  precip: number
  code: number
  wind: number
  gust: number
}

/** Коди погоди WMO — беремо лише те, що справді впливає на їзду. */
export function weatherText(code: number): string {
  if (code === 0) return 'ясно'
  if (code <= 2) return 'мінлива хмарність'
  if (code === 3) return 'хмарно'
  if (code === 45 || code === 48) return 'туман'
  if (code >= 51 && code <= 57) return 'мряка'
  if (code >= 61 && code <= 65) return 'дощ'
  if (code >= 66 && code <= 67) return 'крижаний дощ'
  if (code >= 71 && code <= 77) return 'сніг'
  if (code >= 80 && code <= 82) return 'злива'
  if (code >= 85 && code <= 86) return 'снігопад'
  if (code >= 95) return 'гроза'
  return 'погода невідома'
}

export function weatherIcon(code: number): string {
  if (code === 0) return '☀️'
  if (code <= 2) return '🌤️'
  if (code === 3) return '☁️'
  if (code === 45 || code === 48) return '🌫️'
  if (code >= 51 && code <= 57) return '🌦️'
  if (code >= 61 && code <= 67) return '🌧️'
  if (code >= 71 && code <= 86) return '🌨️'
  if (code >= 95) return '⛈️'
  return '🌡️'
}

/**
 * Небезпечна для мотоцикліста погода: слизько або зносить вітром.
 * Орієнтуємось не лише на міліметри — навіть мряка, яка в міліметрах
 * майже нуль, робить дорогу слизькою, тому будь-які опади рахуємо.
 */
export function isNasty(p: WeatherPoint): boolean {
  const precipitation = p.code >= 51 // мряка, дощ, сніг, злива, гроза
  const fog = p.code === 45 || p.code === 48
  return precipitation || fog || p.precip >= 0.2 || p.gust >= 60
}

/**
 * Вибирає з маршруту кілька контрольних точок і рахує, коли ми в них
 * будемо. Більше шести не беремо — прогноз усе одно приблизний,
 * а екран не гумовий.
 */
export function pickCheckpoints(
  coordinates: [number, number][],
  totalDuration: number,
  maxPoints = 5,
): Array<{ coords: [number, number]; atDistance: number; at: number }> {
  if (coordinates.length < 2) return []

  const cumulative: number[] = [0]
  for (let i = 1; i < coordinates.length; i++) {
    const [aLng, aLat] = coordinates[i - 1]
    const [bLng, bLat] = coordinates[i]
    cumulative.push(cumulative[i - 1] + haversine(aLat, aLng, bLat, bLng))
  }
  const total = cumulative[cumulative.length - 1]
  if (total <= 0) return []

  // Приблизно раз на 50 км, але не більше maxPoints.
  const count = Math.min(maxPoints, Math.max(2, Math.round(total / 50_000) + 1))
  const now = Date.now()
  const out: Array<{ coords: [number, number]; atDistance: number; at: number }> = []

  for (let k = 0; k < count; k++) {
    const targetDist = (total * k) / (count - 1)
    let idx = cumulative.findIndex((d) => d >= targetDist)
    if (idx < 0) idx = coordinates.length - 1
    out.push({
      coords: coordinates[idx],
      atDistance: cumulative[idx],
      at: now + totalDuration * 1000 * (targetDist / total),
    })
  }
  return out
}

/** Запитує прогноз одразу для всіх точок — служба вміє їх пачкою. */
export async function fetchWeather(
  points: Array<{ coords: [number, number]; atDistance: number; at: number }>,
): Promise<WeatherPoint[]> {
  if (points.length === 0) return []

  const params = new URLSearchParams({
    latitude: points.map((p) => p.coords[1].toFixed(4)).join(','),
    longitude: points.map((p) => p.coords[0].toFixed(4)).join(','),
    hourly: 'temperature_2m,precipitation,weather_code,wind_speed_10m,wind_gusts_10m',
    forecast_days: '2',
    timezone: 'UTC',
  })

  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`)
  if (!res.ok) throw new Error('Не вдалося отримати прогноз')
  const raw = await res.json()
  // Для однієї точки служба віддає обʼєкт, для кількох — масив.
  const list = Array.isArray(raw) ? raw : [raw]

  return points.map((p, i) => {
    const h = list[i]?.hourly
    const idx = nearestHourIndex(h?.time ?? [], p.at)
    return {
      atDistance: p.atDistance,
      at: p.at,
      coords: p.coords,
      temp: h?.temperature_2m?.[idx] ?? NaN,
      precip: h?.precipitation?.[idx] ?? 0,
      code: h?.weather_code?.[idx] ?? -1,
      wind: h?.wind_speed_10m?.[idx] ?? 0,
      gust: h?.wind_gusts_10m?.[idx] ?? 0,
    }
  })
}

function nearestHourIndex(times: string[], target: number): number {
  if (times.length === 0) return 0
  let best = 0
  let bestDiff = Infinity
  for (let i = 0; i < times.length; i++) {
    // Служба віддає час без зони, але ми просили UTC.
    const t = Date.parse(times[i] + 'Z')
    const diff = Math.abs(t - target)
    if (diff < bestDiff) {
      bestDiff = diff
      best = i
    }
  }
  return best
}
