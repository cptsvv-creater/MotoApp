import { useEffect, useRef, useState } from 'react'
import { haversine } from '../lib/geo'

/**
 * Скільки часу райдер не рухається. Потрібно, щоб нагадати «ти ще їдеш?»
 * тому, хто забув натиснути «Стоп» — і нікого при цьому не сполохати.
 *
 * Питаємо саме райдера, а не гадаємо за нього: заправка з обідом легко
 * триває пів години, і мовчазний висновок «приїхав» був би брехнею.
 */

/** Радіус, у межах якого вважаємо, що ми стоїмо на місці (метри). */
const JITTER_M = 60
/** Швидкість, нижчу за яку вважаємо стоянкою (м/с ≈ 3.6 км/год). */
const STILL_SPEED = 1

export function useStationary(position: GeolocationPosition | null, active: boolean) {
  const [stationaryMs, setStationaryMs] = useState(0)
  const anchorRef = useRef<{ lat: number; lng: number } | null>(null)
  const sinceRef = useRef<number | null>(null)

  useEffect(() => {
    if (!active) {
      anchorRef.current = null
      sinceRef.current = null
      setStationaryMs(0)
      return
    }
    if (!position) return

    const { latitude, longitude, speed } = position.coords
    const anchor = anchorRef.current
    const moving = (speed ?? 0) > STILL_SPEED

    if (!anchor || moving || haversine(anchor.lat, anchor.lng, latitude, longitude) > JITTER_M) {
      // Зрушили з місця — відлік починається спочатку.
      anchorRef.current = { lat: latitude, lng: longitude }
      sinceRef.current = moving ? null : Date.now()
      setStationaryMs(0)
      return
    }

    if (sinceRef.current == null) sinceRef.current = Date.now()
    setStationaryMs(Date.now() - sinceRef.current)
  }, [position, active])

  /** Почати відлік заново — коли райдер сказав «ще їду». */
  function reset() {
    sinceRef.current = Date.now()
    setStationaryMs(0)
  }

  return { stationaryMs, reset }
}
