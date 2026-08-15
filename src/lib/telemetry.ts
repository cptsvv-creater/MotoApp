import type { TrackPoint } from '../db'
import { haversine } from './geo'

/**
 * Телеметрія поїздки з уже записаного треку.
 *
 * Кут нахилу НЕ вимірюється акселерометром: у правильно пройденому
 * повороті відцентрова сила й гравітація складаються рівно вздовж осі
 * байка, тому датчик показує «низ» туди ж, куди й на прямій. Натомість
 * кут виводиться з фізики руху по дузі:
 *
 *     нахил = arctan( швидкість × кутова швидкість повороту / g )
 *
 * Обидві величини беремо з GPS, тому результат не залежить від того,
 * як лежить телефон у тримачі, і однаковий у всіх райдерів.
 */

const G = 9.81
/** Повільніше за це (м/с ≈ 18 км/год) курс від GPS стрибає, і кут — вигадка. */
const MIN_SPEED = 5
/** Фізично недосяжний нахил: усе більше — шум, а не поворот. */
const MAX_LEAN_DEG = 55
/** Вікно згладжування, секунди. Прибирає тремтіння, лишає реальні дуги. */
const SMOOTH_S = 3

export interface TelemetrySample {
  t: number
  /** метрів від початку поїздки */
  distance: number
  /** км/год */
  speed: number
  /** градуси: відʼємні — нахил ліворуч, додатні — праворуч */
  lean: number
  /** м/с²: додатні — розгін, відʼємні — гальмування */
  accel: number
}

export interface Telemetry {
  samples: TelemetrySample[]
  maxLeanLeft: number
  maxLeanRight: number
  /** Середній кут у поворотах — рівні ділянки не враховуються */
  avgLean: number
  maxAccel: number
  maxBraking: number
  /** Скільки часу (мс) провели в нахилі понад 20° */
  timeLeaning: number
}

const empty: Telemetry = {
  samples: [],
  maxLeanLeft: 0,
  maxLeanRight: 0,
  avgLean: 0,
  maxAccel: 0,
  maxBraking: 0,
  timeLeaning: 0,
}

/** Курс від першої точки до другої, у градусах. */
function bearing(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const φ1 = toRad(aLat)
  const φ2 = toRad(bLat)
  const Δλ = toRad(bLng - aLng)
  const y = Math.sin(Δλ) * Math.cos(φ2)
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  return (Math.atan2(y, x) * 180) / Math.PI
}

/** Різниця курсів у діапазоні −180…180: щоб перехід через північ не давав 359°. */
function angleDelta(from: number, to: number): number {
  let d = ((to - from + 540) % 360) - 180
  if (d === -180) d = 180
  return d
}

export function computeTelemetry(points: TrackPoint[]): Telemetry {
  if (points.length < 3) return empty

  const raw: TelemetrySample[] = []
  let distance = 0
  let prevBearing: number | null = null
  let prevSpeed: number | null = null

  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    const dt = (b.t - a.t) / 1000
    if (dt <= 0 || dt > 10) {
      // Розрив у записі: наступний відрізок починаємо з чистого аркуша.
      prevBearing = null
      prevSpeed = null
      continue
    }

    const step = haversine(a.lat, a.lng, b.lat, b.lng)
    distance += step

    const speed = b.speed != null && b.speed >= 0 ? b.speed : step / dt
    const brg = bearing(a.lat, a.lng, b.lat, b.lng)

    let lean = 0
    if (prevBearing != null && speed >= MIN_SPEED) {
      // Кутова швидкість повороту, радіан за секунду.
      const omega = (angleDelta(prevBearing, brg) * Math.PI) / 180 / dt
      const deg = (Math.atan((speed * omega) / G) * 180) / Math.PI
      if (Math.abs(deg) <= MAX_LEAN_DEG) lean = deg
    }

    const accel = prevSpeed != null ? (speed - prevSpeed) / dt : 0

    raw.push({
      t: b.t,
      distance,
      speed: speed * 3.6,
      lean,
      accel: Math.abs(accel) < 8 ? accel : 0, // понад 8 м/с² — стрибок GPS
    })

    prevBearing = brg
    prevSpeed = speed
  }

  const samples = smooth(raw)

  let maxLeanLeft = 0
  let maxLeanRight = 0
  let leanSum = 0
  let leanCount = 0
  let maxAccel = 0
  let maxBraking = 0
  let timeLeaning = 0

  for (let i = 0; i < samples.length; i++) {
    const s = samples[i]
    if (s.lean < maxLeanLeft) maxLeanLeft = s.lean
    if (s.lean > maxLeanRight) maxLeanRight = s.lean
    if (Math.abs(s.lean) > 5) {
      leanSum += Math.abs(s.lean)
      leanCount++
    }
    if (Math.abs(s.lean) > 20 && i > 0) timeLeaning += s.t - samples[i - 1].t
    if (s.accel > maxAccel) maxAccel = s.accel
    if (s.accel < maxBraking) maxBraking = s.accel
  }

  return {
    samples,
    maxLeanLeft: Math.abs(maxLeanLeft),
    maxLeanRight,
    avgLean: leanCount > 0 ? leanSum / leanCount : 0,
    maxAccel,
    maxBraking: Math.abs(maxBraking),
    timeLeaning,
  }
}

/** Ковзне середнє по часу: GPS тремтить, а дуга повороту триває секунди. */
function smooth(list: TelemetrySample[]): TelemetrySample[] {
  return list.map((s, i) => {
    let leanSum = 0
    let accelSum = 0
    let n = 0
    for (let j = i; j >= 0; j--) {
      if ((s.t - list[j].t) / 1000 > SMOOTH_S) break
      leanSum += list[j].lean
      accelSum += list[j].accel
      n++
    }
    return { ...s, lean: leanSum / n, accel: accelSum / n }
  })
}
