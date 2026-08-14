import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Виявлення падіння за акселерометром.
 *
 * Логіка навмисно консервативна: телефон у тримачі трясе на кожній ямі,
 * тому одного удару замало. Падінням вважаємо збіг трьох ознак —
 * райдер їхав, стався різкий удар, і після нього мотоцикл стоїть.
 * Хибна тривога дратує, але ціна пропущеного падіння незрівнянно вища,
 * тому поріг радше чутливий, ніж навпаки — у райдера є 30 секунд, щоб
 * скасувати.
 */

/** Удар від такого прискорення (м/с²) вважаємо підозрілим. ~3.5g */
const IMPACT = 35
/** Перед ударом райдер мав рухатись швидше за це (м/с ≈ 15 км/год) */
const WAS_RIDING = 4
/** Після удару рух повільніший за це (м/с ≈ 3 км/год) вважаємо зупинкою */
const STOPPED = 0.8
/** Скільки чекаємо після удару, перш ніж вирішити */
const CONFIRM_MS = 8000

export type CrashSupport = 'unavailable' | 'needs-permission' | 'ready'

export function useCrashDetect(position: GeolocationPosition | null, enabled: boolean) {
  const [support, setSupport] = useState<CrashSupport>('unavailable')
  const [suspected, setSuspected] = useState(false)
  const [lastImpact, setLastImpact] = useState<number | null>(null)

  const speedRef = useRef(0)
  const maxRecentSpeedRef = useRef(0)
  const impactAtRef = useRef<number | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Тримаємо свіжу швидкість і памʼятаємо, чи райдер щойно їхав.
  useEffect(() => {
    const s = position?.coords.speed
    if (s != null && s >= 0) {
      speedRef.current = s
      if (s > maxRecentSpeedRef.current) maxRecentSpeedRef.current = s
      // Забуваємо «розгін» поступово, щоб зупинка на світлофорі
      // через десять хвилин не рахувалась як падіння.
      setTimeout(() => {
        maxRecentSpeedRef.current = Math.max(speedRef.current, maxRecentSpeedRef.current * 0.6)
      }, 15_000)
    }
  }, [position])

  useEffect(() => {
    if (typeof DeviceMotionEvent === 'undefined') {
      setSupport('unavailable')
      return
    }
    const needsPermission =
      typeof (DeviceMotionEvent as unknown as { requestPermission?: unknown }).requestPermission ===
      'function'
    setSupport(needsPermission ? 'needs-permission' : 'ready')
  }, [])

  /** На айфоні доступ до датчиків дається лише у відповідь на дотик. */
  const requestPermission = useCallback(async () => {
    const anyDME = DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> }
    if (typeof anyDME.requestPermission !== 'function') {
      setSupport('ready')
      return true
    }
    try {
      const result = await anyDME.requestPermission()
      const ok = result === 'granted'
      setSupport(ok ? 'ready' : 'needs-permission')
      return ok
    } catch {
      return false
    }
  }, [])

  useEffect(() => {
    if (!enabled || support !== 'ready') return

    function onMotion(e: DeviceMotionEvent) {
      const a = e.accelerationIncludingGravity
      if (!a || a.x == null || a.y == null || a.z == null) return
      const magnitude = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z)

      if (import.meta.env.DEV && magnitude > 20) {
        console.info(
          `[MotoApp] удар ${magnitude.toFixed(1)}, недавня швидкість ${maxRecentSpeedRef.current.toFixed(1)}, зараз ${speedRef.current.toFixed(1)}`,
        )
      }

      if (magnitude < IMPACT) return
      if (impactAtRef.current) return // вже рахуємо цей удар
      if (maxRecentSpeedRef.current < WAS_RIDING) return // стояли — не падіння

      impactAtRef.current = Date.now()
      setLastImpact(magnitude)

      // Дивимось, що буде далі: якщо мотоцикл поїхав — все гаразд.
      timerRef.current = setTimeout(() => {
        if (speedRef.current <= STOPPED) setSuspected(true)
        impactAtRef.current = null
      }, CONFIRM_MS)
    }

    window.addEventListener('devicemotion', onMotion)
    return () => {
      window.removeEventListener('devicemotion', onMotion)
      if (timerRef.current) clearTimeout(timerRef.current)
      impactAtRef.current = null
    }
  }, [enabled, support])

  const dismiss = useCallback(() => {
    setSuspected(false)
    setLastImpact(null)
    impactAtRef.current = null
    maxRecentSpeedRef.current = 0
  }, [])

  /** Для перевірки без падіння з мотоцикла. */
  const simulate = useCallback(() => setSuspected(true), [])

  return { support, suspected, lastImpact, requestPermission, dismiss, simulate }
}
