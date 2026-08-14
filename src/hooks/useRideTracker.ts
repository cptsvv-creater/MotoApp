import { useCallback, useEffect, useRef, useState } from 'react'
import { db, type Ride, type TrackPoint } from '../db'
import { haversine } from '../lib/geo'

export type TrackerStatus = 'idle' | 'recording' | 'paused'

/** Точки з гіршою точністю за цю (метри) ігноруємо — це шум. */
const MAX_ACCURACY = 40
/** Менші за це зміщення (метри) вважаємо тремтінням GPS на місці. */
const MIN_STEP = 4
/** Від цієї швидкості (м/с ≈ 5.4 км/год) вважаємо, що райдер їде. */
const MOVING_SPEED = 1.5
/** Дрібні коливання висоти нижче цього (метри) не рахуємо як набір. */
const ASCENT_THRESHOLD = 3
/**
 * Якщо між точками минуло більше за це — запис переривався (телефон
 * згорнули, екран заблокувався, зникло небо). Зшивати такий розрив
 * прямою лінією не можна: намалюється зайвий шлях і зайві кілометри.
 */
const GAP_MS = 90_000

export interface LiveStats {
  distance: number
  movingTime: number
  maxSpeed: number
  ascent: number
  speed: number
  elapsed: number
  points: number
}

const emptyStats: LiveStats = {
  distance: 0,
  movingTime: 0,
  maxSpeed: 0,
  ascent: 0,
  speed: 0,
  elapsed: 0,
  points: 0,
}

export function useRideTracker() {
  const [status, setStatus] = useState<TrackerStatus>('idle')
  const [rideId, setRideId] = useState<number | null>(null)
  /** Поїздка, яку не завершили: телефон вивантажив сторінку з памʼяті. */
  const [unfinished, setUnfinished] = useState<Ride | null>(null)
  const [stats, setStats] = useState<LiveStats>(emptyStats)
  const [track, setTrack] = useState<[number, number][]>([])
  const [position, setPosition] = useState<GeolocationPosition | null>(null)
  const [error, setError] = useState<string | null>(null)

  const watchRef = useRef<number | null>(null)
  const rideIdRef = useRef<number | null>(null)
  const statusRef = useRef<TrackerStatus>('idle')
  const startedAtRef = useRef<number>(0)
  const prevRef = useRef<{ lat: number; lng: number; t: number; alt: number | null } | null>(null)
  const statsRef = useRef<LiveStats>(emptyStats)

  statusRef.current = status

  const persistStats = useCallback(async () => {
    const id = rideIdRef.current
    if (id == null) return
    const s = statsRef.current
    await db.rides.update(id, {
      distance: s.distance,
      movingTime: s.movingTime,
      maxSpeed: s.maxSpeed,
      ascent: s.ascent,
    })
  }, [])

  const handlePosition = useCallback((pos: GeolocationPosition) => {
    setPosition(pos)
    setError(null)

    if (statusRef.current !== 'recording') return
    const id = rideIdRef.current
    if (id == null) return

    const { latitude, longitude, altitude, speed, heading, accuracy } = pos.coords
    if (accuracy != null && accuracy > MAX_ACCURACY) return

    const t = pos.timestamp
    const prev = prevRef.current
    const s = { ...statsRef.current }

    if (prev && t - prev.t > GAP_MS) {
      // Розрив: починаємо новий відрізок, не додаючи нічого до дистанції.
      prevRef.current = { lat: latitude, lng: longitude, t, alt: altitude ?? null }
      setTrack((cur) => [...cur, [longitude, latitude]])
      void db.points.add({
        rideId: id,
        t,
        lat: latitude,
        lng: longitude,
        alt: altitude ?? null,
        speed: speed ?? null,
        heading: heading ?? null,
        acc: accuracy ?? null,
      })
      return
    }

    if (prev) {
      const step = haversine(prev.lat, prev.lng, latitude, longitude)
      const dt = t - prev.t
      const gpsSpeed = speed != null && speed >= 0 ? speed : dt > 0 ? step / (dt / 1000) : 0

      // Стоїмо на місці — не накручуємо дистанцію на шумі GPS.
      if (step < MIN_STEP && gpsSpeed < MOVING_SPEED) return

      s.distance += step
      if (dt > 0 && dt < 30_000 && gpsSpeed >= MOVING_SPEED) s.movingTime += dt
      if (gpsSpeed > s.maxSpeed) s.maxSpeed = gpsSpeed
      if (altitude != null && prev.alt != null) {
        const dAlt = altitude - prev.alt
        if (dAlt > ASCENT_THRESHOLD) s.ascent += dAlt
      }
    }

    s.speed = speed != null && speed >= 0 ? speed : 0
    s.elapsed = t - startedAtRef.current
    s.points += 1

    prevRef.current = { lat: latitude, lng: longitude, t, alt: altitude ?? prev?.alt ?? null }
    statsRef.current = s
    setStats(s)
    setTrack((cur) => [...cur, [longitude, latitude]])

    const point: TrackPoint = {
      rideId: id,
      t,
      lat: latitude,
      lng: longitude,
      alt: altitude ?? null,
      speed: speed ?? null,
      heading: heading ?? null,
      acc: accuracy ?? null,
    }
    void db.points.add(point)
    if (s.points % 10 === 0) void persistStats()
  }, [persistStats])

  const handleError = useCallback((err: GeolocationPositionError) => {
    const messages: Record<number, string> = {
      1: 'Немає доступу до геолокації. Дозвольте його в налаштуваннях браузера.',
      2: 'Не вдається визначити позицію. Перевірте, чи увімкнено GPS.',
      3: 'GPS не відповідає. Спробуйте вийти на відкрите місце.',
    }
    setError(messages[err.code] ?? err.message)
  }, [])

  const startWatch = useCallback(() => {
    if (watchRef.current != null) return
    if (!('geolocation' in navigator)) {
      setError('Цей телефон не підтримує геолокацію.')
      return
    }
    watchRef.current = navigator.geolocation.watchPosition(handlePosition, handleError, {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 20_000,
    })
  }, [handlePosition, handleError])

  const stopWatch = useCallback(() => {
    if (watchRef.current != null) {
      navigator.geolocation.clearWatch(watchRef.current)
      watchRef.current = null
    }
  }, [])

  // Показуємо позицію на карті ще до старту запису.
  useEffect(() => {
    startWatch()
    return stopWatch
  }, [startWatch, stopWatch])

  // Після запуску шукаємо поїздку, яку не встигли завершити.
  useEffect(() => {
    let cancelled = false
    db.rides
      .filter((r) => r.endedAt == null)
      .toArray()
      .then((list) => {
        if (cancelled || list.length === 0) return
        setUnfinished(list[list.length - 1])
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  /** Продовжити обірвану поїздку: підхоплюємо трек і лічильники з диска. */
  const resume = useCallback(async (ride: Ride) => {
    const points = await db.points.where('rideId').equals(ride.id!).sortBy('t')
    const last = points[points.length - 1]

    rideIdRef.current = ride.id!
    startedAtRef.current = ride.startedAt
    // Свідомо не зшиваємо з останньою точкою: між ними міг бути шлях.
    prevRef.current = null
    statsRef.current = {
      distance: ride.distance,
      movingTime: ride.movingTime,
      maxSpeed: ride.maxSpeed,
      ascent: ride.ascent,
      speed: 0,
      elapsed: (last?.t ?? Date.now()) - ride.startedAt,
      points: points.length,
    }
    setStats(statsRef.current)
    setTrack(points.map((p) => [p.lng, p.lat] as [number, number]))
    setRideId(ride.id!)
    setUnfinished(null)
    setStatus('recording')
  }, [])

  /** Завершити обірвану поїздку часом останньої записаної точки. */
  const finishAbandoned = useCallback(async (ride: Ride) => {
    const last = await db.points.where('rideId').equals(ride.id!).last()
    await db.rides.update(ride.id!, { endedAt: last?.t ?? ride.startedAt })
    setUnfinished(null)
  }, [])

  const start = useCallback(async () => {
    const startedAt = Date.now()
    const id = await db.rides.add({
      startedAt,
      endedAt: null,
      distance: 0,
      movingTime: 0,
      maxSpeed: 0,
      ascent: 0,
      title: '',
      notes: '',
    })
    rideIdRef.current = id as number
    startedAtRef.current = startedAt
    prevRef.current = null
    statsRef.current = { ...emptyStats }
    setStats({ ...emptyStats })
    setTrack([])
    setRideId(id as number)
    setStatus('recording')
    startWatch()
  }, [startWatch])

  const pause = useCallback(() => {
    prevRef.current = null // після паузи не зшиваємо розрив у пряму лінію
    setStatus('paused')
  }, [])

  const resumePaused = useCallback(() => {
    prevRef.current = null
    setStatus('recording')
  }, [])

  const stop = useCallback(async () => {
    const id = rideIdRef.current
    setStatus('idle')
    if (id != null) {
      await persistStats()
      await db.rides.update(id, { endedAt: Date.now() })
      // Порожні поїздки (випадково натиснув «Старт/Стоп») не зберігаємо.
      const count = await db.points.where('rideId').equals(id).count()
      if (count < 2) {
        await db.points.where('rideId').equals(id).delete()
        await db.rides.delete(id)
      }
    }
    rideIdRef.current = null
    setRideId(null)
    return id
  }, [persistStats])

  // Тікаючий таймер, щоб час ішов навіть коли GPS мовчить.
  useEffect(() => {
    if (status !== 'recording') return
    const timer = setInterval(() => {
      const s = { ...statsRef.current, elapsed: Date.now() - startedAtRef.current }
      statsRef.current = s
      setStats(s)
    }, 1000)
    return () => clearInterval(timer)
  }, [status])

  return {
    status,
    rideId,
    stats,
    track,
    position,
    error,
    unfinished,
    start,
    pause,
    resume: resumePaused,
    resumeRide: resume,
    finishAbandoned,
    stop,
  }
}
