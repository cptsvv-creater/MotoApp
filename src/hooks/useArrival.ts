import { useEffect, useRef, useState } from 'react'
import { haversine } from '../lib/geo'
import type { Place } from '../db'

/**
 * Впевнене «прибув». Спрацьовує лише там, де ми точно знаємо, що поїздка
 * скінчилась: у своєму місці (дім, гараж) або у фініші прокладеного
 * маршруту. Зупинка на заправці нічого не надсилає — крапка на живій
 * карті й так усе показує рідним, а хибне «прибув» гірше за мовчання.
 */

/** Радіус, у якому вважаємо, що ми саме тут. Менше давало б промахи в місті. */
const RADIUS_M = 100
/** Скільки треба простояти у своєму місці. */
const AT_PLACE_MS = 10 * 60_000
/** У фініші маршруту вистачає меншого: ми ж саме сюди їхали. */
const AT_DESTINATION_MS = 5 * 60_000

export interface Arrival {
  /** 'home' | назва місця | 'destination' */
  place: string
  label: string
}

export function useArrival(
  position: GeolocationPosition | null,
  recording: boolean,
  stationaryMs: number,
  places: Place[],
  destination: [number, number] | null,
) {
  const [arrival, setArrival] = useState<Arrival | null>(null)
  const firedRef = useRef(false)

  // Хвилини можна пришвидшити в адресі — потрібно для перевірки.
  const speedUp = Number(new URLSearchParams(location.search).get('arrive')) || 0
  const atPlaceMs = speedUp ? speedUp * 60_000 : AT_PLACE_MS
  const atDestMs = speedUp ? speedUp * 60_000 : AT_DESTINATION_MS

  useEffect(() => {
    if (!recording) {
      firedRef.current = false
      setArrival(null)
      return
    }
    if (firedRef.current || !position) return

    const { latitude, longitude } = position.coords

    const near = places.find(
      (p) => haversine(latitude, longitude, p.lat, p.lng) <= RADIUS_M,
    )
    if (near && stationaryMs >= atPlaceMs) {
      firedRef.current = true
      setArrival({
        place: near.isHome ? 'home' : near.name,
        label: near.isHome ? 'удома' : `на місці ${near.name}`,
      })
      return
    }

    if (destination) {
      const toFinish = haversine(latitude, longitude, destination[1], destination[0])
      if (toFinish <= RADIUS_M && stationaryMs >= atDestMs) {
        firedRef.current = true
        setArrival({ place: '', label: 'у пункті призначення' })
      }
    }
  }, [position, recording, stationaryMs, places, destination, atPlaceMs, atDestMs])

  return arrival
}
