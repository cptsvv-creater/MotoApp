import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { MapView } from '../components/MapView'
import { db, deleteRide } from '../db'
import { formatDate, formatDistance, formatDuration, kmh, toLineString } from '../lib/geo'

export function RideDetailScreen({ rideId, onBack }: { rideId: number; onBack: () => void }) {
  const ride = useLiveQuery(() => db.rides.get(rideId), [rideId])
  const points = useLiveQuery(
    () => db.points.where('rideId').equals(rideId).sortBy('t'),
    [rideId],
  )
  const [confirmDelete, setConfirmDelete] = useState(false)

  if (!ride || !points) return <div className="screen pad">Завантаження…</div>

  const duration = (ride.endedAt ?? ride.startedAt) - ride.startedAt
  const avgSpeed = ride.movingTime > 0 ? ride.distance / (ride.movingTime / 1000) : 0

  async function handleDelete() {
    await deleteRide(rideId)
    onBack()
  }

  return (
    <div className="screen detail-screen">
      <div className="map-wrap">
        <MapView track={toLineString(points)} fit zoomButtons />
        <button className="back-btn" onClick={onBack} aria-label="Назад">
          ←
        </button>
      </div>

      <div className="detail-body scroll">
        <input
          className="title-input"
          value={ride.title}
          placeholder={formatDate(ride.startedAt)}
          onChange={(e) => db.rides.update(rideId, { title: e.target.value })}
        />
        <div className="muted small">{formatDate(ride.startedAt)}</div>

        <div className="stat-grid">
          <Stat label="Дистанція" value={formatDistance(ride.distance)} />
          <Stat label="Загальний час" value={formatDuration(duration)} />
          <Stat label="У русі" value={formatDuration(ride.movingTime)} />
          <Stat label="Середня" value={`${Math.round(kmh(avgSpeed))} км/год`} />
          <Stat label="Максимальна" value={`${Math.round(kmh(ride.maxSpeed))} км/год`} />
          <Stat label="Набір висоти" value={`${Math.round(ride.ascent)} м`} />
        </div>

        <textarea
          className="notes"
          placeholder="Нотатки про поїздку…"
          value={ride.notes}
          onChange={(e) => db.rides.update(rideId, { notes: e.target.value })}
        />

        {confirmDelete ? (
          <div className="confirm">
            <span>Видалити поїздку назавжди?</span>
            <button className="btn btn-stop" onClick={handleDelete}>
              Так, видалити
            </button>
            <button className="btn btn-ghost" onClick={() => setConfirmDelete(false)}>
              Скасувати
            </button>
          </div>
        ) : (
          <button className="btn btn-ghost danger" onClick={() => setConfirmDelete(true)}>
            Видалити поїздку
          </button>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  )
}
