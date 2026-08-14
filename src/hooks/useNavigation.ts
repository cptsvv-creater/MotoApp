import { useCallback, useEffect, useRef, useState } from 'react'
import { haversine } from '../lib/geo'
import { announcement, speak, type Route } from '../lib/steps'

/** Далі за цю відстань від лінії маршруту вважаємо, що райдер звернув не туди. */
const OFF_ROUTE_M = 80
/** Не перебудовуємо маршрут частіше, ніж раз на стільки мілісекунд. */
const REROUTE_COOLDOWN = 20_000
/** На якій відстані до маневру попереджати голосом. */
const FAR_ANNOUNCE = 400
const NEAR_ANNOUNCE = 90

export interface NavState {
  route: Route | null
  destination: [number, number] | null
  loading: boolean
  error: string | null
  /** Індекс поточної ділянки маршруту */
  stepIndex: number
  /** Метрів до наступного маневру */
  toManeuver: number
  /** Метрів до фінішу */
  remaining: number
  offRoute: boolean
}

export function useNavigation(
  position: GeolocationPosition | null,
  options: { voice: boolean; avoidHighways: boolean },
) {
  const [route, setRoute] = useState<Route | null>(null)
  const [destination, setDestination] = useState<[number, number] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stepIndex, setStepIndex] = useState(0)
  const [toManeuver, setToManeuver] = useState(0)
  const [remaining, setRemaining] = useState(0)
  const [offRoute, setOffRoute] = useState(false)

  const lastRerouteRef = useRef(0)
  const spokenRef = useRef<{ index: number; far: boolean; near: boolean }>({
    index: -1,
    far: false,
    near: false,
  })
  const optionsRef = useRef(options)
  optionsRef.current = options

  const build = useCallback(
    async (from: [number, number], to: [number, number]) => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch('/api/route', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            start: from,
            end: to,
            avoidHighways: optionsRef.current.avoidHighways,
          }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Не вдалося прокласти маршрут')
        setRoute(data as Route)
        setStepIndex(0)
        spokenRef.current = { index: -1, far: false, near: false }
        return data as Route
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Не вдалося прокласти маршрут')
        return null
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  /** Прокласти маршрут до вибраної точки від поточного місця. */
  const navigateTo = useCallback(
    async (to: [number, number]) => {
      if (!position) {
        setError('Спершу треба знайти вашу позицію')
        return
      }
      setDestination(to)
      await build([position.coords.longitude, position.coords.latitude], to)
    },
    [position, build],
  )

  const cancel = useCallback(() => {
    setRoute(null)
    setDestination(null)
    setError(null)
    setOffRoute(false)
    speechSynthesis?.cancel()
  }, [])

  // Стежимо за рухом: рахуємо, скільки лишилось, і озвучуємо маневри.
  useEffect(() => {
    if (!route || !position) return
    const me: [number, number] = [position.coords.longitude, position.coords.latitude]

    // Найближча ділянка маршруту — по кінцевій точці кожного кроку.
    let bestIdx = stepIndex
    let bestDist = Infinity
    for (let i = stepIndex; i < route.steps.length; i++) {
      const p = route.steps[i].endLocation
      if (!p) continue
      const d = haversine(me[1], me[0], p[1], p[0])
      if (d < bestDist) {
        bestDist = d
        bestIdx = i
      }
      // Далі шукати немає сенсу: маршрут попереду тільки віддаляється.
      if (d > 3000) break
    }

    if (bestIdx !== stepIndex) {
      setStepIndex(bestIdx)
      spokenRef.current = { index: bestIdx, far: false, near: false }
    }

    setToManeuver(bestDist)

    // Скільки лишилось до фінішу: поточна ділянка плюс усі наступні.
    const rest = route.steps.slice(bestIdx + 1).reduce((s, st) => s + st.distance, 0)
    setRemaining(bestDist + rest)

    // Чи не звернули ми з маршруту.
    let minToLine = Infinity
    for (const c of route.coordinates) {
      const d = haversine(me[1], me[0], c[1], c[0])
      if (d < minToLine) minToLine = d
      if (minToLine < OFF_ROUTE_M) break
    }
    const isOff = minToLine > OFF_ROUTE_M
    setOffRoute(isOff)

    if (isOff && destination && Date.now() - lastRerouteRef.current > REROUTE_COOLDOWN) {
      lastRerouteRef.current = Date.now()
      if (optionsRef.current.voice) speak('Перебудовую маршрут')
      void build(me, destination)
      return
    }

    // Голосові підказки: здалеку і безпосередньо перед маневром.
    if (!optionsRef.current.voice) return
    const next = route.steps[bestIdx + 1]
    if (!next) return
    const spoken = spokenRef.current
    if (spoken.index !== bestIdx) spokenRef.current = { index: bestIdx, far: false, near: false }

    if (!spokenRef.current.far && bestDist <= FAR_ANNOUNCE && bestDist > NEAR_ANNOUNCE) {
      spokenRef.current.far = true
      speak(announcement(next, bestDist))
    } else if (!spokenRef.current.near && bestDist <= NEAR_ANNOUNCE) {
      spokenRef.current.near = true
      spokenRef.current.far = true
      speak(announcement(next, bestDist))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position, route])

  const state: NavState = {
    route,
    destination,
    loading,
    error,
    stepIndex,
    toManeuver,
    remaining,
    offRoute,
  }

  return { ...state, navigateTo, cancel }
}
