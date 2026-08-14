import { useEffect, useRef, useState } from 'react'

interface Place {
  label: string
  region: string
  coords: [number, number]
}

/** Пошук місця за назвою. Питає сервер, який уже ходить до служби з ключем. */
export function DestinationSearch({
  near,
  avoidHighways,
  onAvoidHighways,
  onPick,
  onClose,
}: {
  near: [number, number] | null
  avoidHighways: boolean
  onAvoidHighways: (v: boolean) => void
  onPick: (coords: [number, number], label: string) => void
  onClose: () => void
}) {
  const [q, setQ] = useState('')
  const [places, setPlaces] = useState<Place[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const seq = useRef(0)
  // Позиція оновлюється щосекунди від GPS. Якщо тримати її в залежностях
  // ефекту, пошук перезапускатиметься і ніколи не встигне відпрацювати.
  const nearRef = useRef(near)
  nearRef.current = near

  useEffect(() => {
    if (q.trim().length < 2) {
      setPlaces([])
      return
    }
    // Не смикаємо сервер на кожну літеру.
    const id = ++seq.current
    const timer = setTimeout(async () => {
      setLoading(true)
      setError(null)
      try {
        const params = new URLSearchParams({ q: q.trim() })
        const from = nearRef.current
        if (from) {
          params.set('lng', String(from[0]))
          params.set('lat', String(from[1]))
        }
        const res = await fetch(`/api/geocode?${params}`)
        const data = await res.json()
        if (id !== seq.current) return
        if (!res.ok) throw new Error(data.error ?? 'Пошук не вдався')
        setPlaces(data.places ?? [])
      } catch (e) {
        if (id === seq.current) setError(e instanceof Error ? e.message : 'Пошук не вдався')
      } finally {
        if (id === seq.current) setLoading(false)
      }
    }, 450)
    return () => clearTimeout(timer)
  }, [q])

  return (
    <div className="search-overlay">
      <div className="search-bar">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Куди їдемо?"
          autoFocus
          enterKeyHint="search"
        />
        <button className="btn-ghost search-close" onClick={onClose}>
          Закрити
        </button>
      </div>

      <label className="checkbox compact">
        <input
          type="checkbox"
          checked={avoidHighways}
          onChange={(e) => onAvoidHighways(e.target.checked)}
        />
        <span>Оминати автомагістралі — цікавіші дороги замість найшвидших</span>
      </label>

      <div className="search-results scroll">
        {loading && <div className="muted small pad-sm">Шукаю…</div>}
        {error && <div className="map-toast error">{error}</div>}
        {!loading && !error && q.trim().length >= 2 && places.length === 0 && (
          <div className="muted small pad-sm">Нічого не знайшлось</div>
        )}
        {places.map((p, i) => (
          <button key={i} className="place-row" onClick={() => onPick(p.coords, p.label)}>
            <div className="place-label">{p.label}</div>
            {p.region && <div className="muted small">{p.region}</div>}
          </button>
        ))}
        {q.trim().length < 2 && (
          <div className="muted small pad-sm">
            Введи назву міста чи місця. Або закрий пошук і затисни палець на карті — точка
            призначення стане там.
          </div>
        )}
      </div>
    </div>
  )
}
