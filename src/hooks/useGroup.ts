import { useCallback, useEffect, useRef, useState } from 'react'
import { clearGroup, loadGroup, saveGroup, type GroupSettings, type Rider } from '../lib/group'
import { haversine } from '../lib/geo'
import { speak } from '../lib/steps'

/** Як часто перегукуємось із групою. Частіше — марно гріти батарею. */
const PING_MS = 12_000
/** Відстав більше ніж на стільки метрів — попереджаємо голосом. */
const BEHIND_M = 700

export function useGroup(position: GeolocationPosition | null, voice: boolean) {
  const [settings, setSettings] = useState<GroupSettings | null>(() => loadGroup())
  const [riders, setRiders] = useState<Rider[]>([])
  const [error, setError] = useState<string | null>(null)

  const positionRef = useRef(position)
  positionRef.current = position
  const voiceRef = useRef(voice)
  voiceRef.current = voice
  const warnedRef = useRef<Map<string, number>>(new Map())

  const join = useCallback((next: GroupSettings) => {
    saveGroup(next)
    setSettings(next)
    setRiders([])
    setError(null)
  }, [])

  const leave = useCallback(async () => {
    const current = settings
    setSettings(null)
    setRiders([])
    clearGroup()
    if (!current) return
    try {
      await fetch('/api/group', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: current.code, riderId: current.riderId, leaving: true }),
      })
    } catch {
      // Не страшно: запис усе одно зникне сам за кілька хвилин.
    }
  }, [settings])

  /** Сигнал лиха: летить у групу разом із поточними координатами. */
  const sendSos = useCallback(async () => {
    const pos = positionRef.current
    if (!settings || !pos) return
    try {
      await fetch('/api/group', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: settings.code,
          riderId: settings.riderId,
          name: settings.name,
          lng: pos.coords.longitude,
          lat: pos.coords.latitude,
          sos: true,
        }),
      })
    } catch {
      // Звʼязку немає — на екрані все одно лишаються координати й виклик 112.
    }
  }, [settings])

  useEffect(() => {
    if (!settings) return

    let stopped = false

    async function ping() {
      const pos = positionRef.current
      if (!pos || !settings) return
      try {
        const res = await fetch('/api/group', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: settings.code,
            riderId: settings.riderId,
            name: settings.name,
            lng: pos.coords.longitude,
            lat: pos.coords.latitude,
            speed: pos.coords.speed,
            heading: pos.coords.heading,
          }),
        })
        const data = await res.json()
        if (stopped) return
        if (!res.ok) {
          setError(data.error ?? 'Не вдалося звʼязатися з групою')
          return
        }
        setError(null)
        setRiders(data.riders ?? [])
        checkBehind(data.riders ?? [], pos)
      } catch {
        if (!stopped) setError('Немає звʼязку з групою')
      }
    }

    function checkBehind(list: Rider[], pos: GeolocationPosition) {
      // Лихо в групі — озвучуємо одразу і незалежно від налаштувань голосу.
      for (const r of list) {
        if (!r.sos) continue
        const key = `sos:${r.id}:${r.sos}`
        if (warnedRef.current.has(key)) continue
        warnedRef.current.set(key, Date.now())
        const d = haversine(pos.coords.latitude, pos.coords.longitude, r.lat, r.lng)
        speak(`Увага! ${r.name} подав сигнал лиха за ${Math.round(d / 100) / 10} кілометра`)
      }

      if (!voiceRef.current) return
      for (const r of list) {
        const d = haversine(pos.coords.latitude, pos.coords.longitude, r.lat, r.lng)
        const lastWarn = warnedRef.current.get(r.id) ?? 0
        if (d > BEHIND_M && Date.now() - lastWarn > 5 * 60 * 1000) {
          warnedRef.current.set(r.id, Date.now())
          speak(`${r.name} відстав на ${Math.round(d / 100) / 10} кілометра`)
        }
        if (d < BEHIND_M / 2) warnedRef.current.delete(r.id)
      }
    }

    void ping()
    const timer = setInterval(ping, PING_MS)
    return () => {
      stopped = true
      clearInterval(timer)
    }
  }, [settings])

  return { settings, riders, error, join, leave, sendSos }
}
