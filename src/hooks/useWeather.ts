import { useEffect, useRef, useState } from 'react'
import { fetchWeather, isNasty, pickCheckpoints, weatherText, type WeatherPoint } from '../lib/weather'
import { speak } from '../lib/steps'
import type { Route } from '../lib/steps'

/** Оновлюємо погоду в поточній точці не частіше, ніж раз на 15 хвилин. */
const CURRENT_REFRESH = 15 * 60 * 1000

export function useWeather(
  position: GeolocationPosition | null,
  route: Route | null,
  voice: boolean,
) {
  const [current, setCurrent] = useState<WeatherPoint | null>(null)
  const [along, setAlong] = useState<WeatherPoint[]>([])
  const lastCurrentRef = useRef(0)
  const warnedRef = useRef<string | null>(null)
  const voiceRef = useRef(voice)
  voiceRef.current = voice

  // Погода там, де ми зараз.
  useEffect(() => {
    if (!position) return
    if (Date.now() - lastCurrentRef.current < CURRENT_REFRESH) return
    lastCurrentRef.current = Date.now()
    const coords: [number, number] = [position.coords.longitude, position.coords.latitude]
    fetchWeather([{ coords, atDistance: 0, at: Date.now() }])
      .then((r) => setCurrent(r[0] ?? null))
      .catch(() => setCurrent(null))
  }, [position])

  // Погода вздовж маршруту — на той час, коли ми туди доїдемо.
  useEffect(() => {
    if (!route) {
      setAlong([])
      warnedRef.current = null
      return
    }
    const points = pickCheckpoints(route.coordinates, route.duration)
    let cancelled = false
    fetchWeather(points)
      .then((r) => {
        if (cancelled) return
        setAlong(r)

        // Попереджаємо голосом один раз про перший неприємний відрізок.
        const bad = r.find(isNasty)
        if (!bad) return
        const key = `${Math.round(bad.atDistance / 1000)}:${bad.code}`
        if (warnedRef.current === key) return
        warnedRef.current = key
        if (voiceRef.current) {
          const km = Math.round(bad.atDistance / 1000)
          speak(km < 2 ? `Попереду ${weatherText(bad.code)}` : `Через ${km} кілометрів ${weatherText(bad.code)}`)
        }
      })
      .catch(() => {
        if (!cancelled) setAlong([])
      })
    return () => {
      cancelled = true
    }
  }, [route])

  return { current, along }
}
