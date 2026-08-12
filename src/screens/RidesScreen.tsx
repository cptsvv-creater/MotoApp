import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { formatDate, formatDistance, formatDuration } from '../lib/geo'

export function RidesScreen({ onOpen }: { onOpen: (rideId: number) => void }) {
  const rides = useLiveQuery(() => db.rides.orderBy('startedAt').reverse().toArray(), [])

  const total = (rides ?? []).reduce((sum, r) => sum + r.distance, 0)

  if (!rides) return <div className="screen pad">Завантаження…</div>

  if (rides.length === 0) {
    return (
      <div className="screen pad empty">
        <div className="empty-icon">🏍️</div>
        <h2>Поїздок ще немає</h2>
        <p>Відкрий вкладку «Поїздка» і натисни «Старт» — маршрут запишеться сам.</p>
      </div>
    )
  }

  return (
    <div className="screen pad scroll">
      <header className="list-header">
        <h2>Мої поїздки</h2>
        <span className="muted">
          {rides.length} · разом {formatDistance(total)}
        </span>
      </header>

      <ul className="ride-list">
        {rides.map((r) => (
          <li key={r.id}>
            <button className="ride-card" onClick={() => onOpen(r.id!)}>
              <div className="ride-title">{r.title || formatDate(r.startedAt)}</div>
              <div className="ride-stats">
                <span>{formatDistance(r.distance)}</span>
                <span>{formatDuration((r.endedAt ?? r.startedAt) - r.startedAt)}</span>
                <span>{Math.round(r.maxSpeed * 3.6)} км/год макс.</span>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
