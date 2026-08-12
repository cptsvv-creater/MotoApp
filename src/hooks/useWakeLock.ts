import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Не дає екрану гаснути. Це ключова річ для мотоцикла: телефон стоїть
 * у тримачі, і поки екран горить — GPS і датчики працюють нормально.
 * Система знімає блокування, коли вкладка йде у фон, тому повертаємо
 * його назад на visibilitychange.
 */
export function useWakeLock(active: boolean) {
  const lockRef = useRef<WakeLockSentinel | null>(null)
  const [held, setHeld] = useState(false)

  const request = useCallback(async () => {
    if (!('wakeLock' in navigator)) return
    if (document.visibilityState !== 'visible') return
    try {
      const lock = await navigator.wakeLock.request('screen')
      lockRef.current = lock
      setHeld(true)
      lock.addEventListener('release', () => setHeld(false))
    } catch {
      setHeld(false)
    }
  }, [])

  useEffect(() => {
    if (!active) {
      lockRef.current?.release().catch(() => {})
      lockRef.current = null
      setHeld(false)
      return
    }

    void request()
    const onVisible = () => {
      if (document.visibilityState === 'visible') void request()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      lockRef.current?.release().catch(() => {})
      lockRef.current = null
    }
  }, [active, request])

  return { held, supported: 'wakeLock' in navigator }
}
