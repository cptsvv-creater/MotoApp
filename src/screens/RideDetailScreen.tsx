import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { MapView } from '../components/MapView'
import { db, deleteRide } from '../db'
import { formatDate, formatDistance, formatDuration, kmh, toLineString } from '../lib/geo'
import { computeTelemetry } from '../lib/telemetry'
import { TelemetryScrub } from '../components/TelemetryScrub'
import { FlyoverScreen } from './FlyoverScreen'

export function RideDetailScreen({ rideId, onBack }: { rideId: number; onBack: () => void }) {
  const ride = useLiveQuery(() => db.rides.get(rideId), [rideId])
  const points = useLiveQuery(
    () => db.points.where('rideId').equals(rideId).sortBy('t'),
    [rideId],
  )
  const [confirmDelete, setConfirmDelete] = useState(false)
  // Рахуємо з уже записаного треку, тому працює і для давніх поїздок.
  const telemetry = useMemo(() => computeTelemetry(points ?? []), [points])
  const [scrub, setScrub] = useState<[number, number] | null>(null)
  const [flyover, setFlyover] = useState(false)

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
        <MapView track={toLineString(points)} fit zoomButtons highlight={scrub} />
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

        {points.length > 5 && (
          <button className="btn btn-primary fly-btn" onClick={() => setFlyover(true)}>
            ✈ Політ над маршрутом
          </button>
        )}

        {telemetry.samples.length > 2 && (
          <>
            <div className="section-head">
              <h3>Телеметрія</h3>
            </div>

            <div className="stat-grid">
              <Stat label="Нахил ліворуч" value={`${Math.round(telemetry.maxLeanLeft)}°`} />
              <Stat label="Нахил праворуч" value={`${Math.round(telemetry.maxLeanRight)}°`} />
              <Stat label="Середній у поворотах" value={`${Math.round(telemetry.avgLean)}°`} />
              <Stat label="У нахилі понад 20°" value={formatDuration(telemetry.timeLeaning)} />
              <Stat label="Прискорення" value={`${telemetry.maxAccel.toFixed(1)} м/с²`} />
              <Stat label="Гальмування" value={`${telemetry.maxBraking.toFixed(1)} м/с²`} />
            </div>

            <TelemetryScrub telemetry={telemetry} points={points} onCursor={setScrub} />
          </>
        )}

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

      {flyover && (
        <FlyoverScreen
          points={points}
          telemetry={telemetry}
          title={ride.title}
          startedAt={ride.startedAt}
          onClose={() => setFlyover(false)}
        />
      )}
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
