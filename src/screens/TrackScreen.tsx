import { useState } from 'react'
import { MapView } from '../components/MapView'
import { useRideTracker } from '../hooks/useRideTracker'
import { useWakeLock } from '../hooks/useWakeLock'
import { formatDistance, formatDuration, kmh } from '../lib/geo'

export function TrackScreen({ onFinished }: { onFinished: (rideId: number) => void }) {
  const { status, stats, track, position, error, start, pause, resume, stop } = useRideTracker()
  const recording = status !== 'idle'
  const wakeLock = useWakeLock(recording)
  const [follow, setFollow] = useState(true)
  const [mapFailed, setMapFailed] = useState(false)

  const me = position
    ? {
        lng: position.coords.longitude,
        lat: position.coords.latitude,
        heading: position.coords.heading,
      }
    : null

  async function handleStop() {
    const id = await stop()
    if (id != null) onFinished(id)
  }

  return (
    <div className="screen track-screen">
      <div className="map-wrap">
        <MapView
          track={track}
          me={me}
          follow={follow}
          onUserMove={() => setFollow(false)}
          onTilesFailed={setMapFailed}
        />
        <button
          className={`follow-btn ${follow ? 'on' : ''}`}
          onClick={() => setFollow((f) => !f)}
          aria-label="Слідувати за мною"
        >
          ◎
        </button>

        <div className="map-overlays">
          {position && !error && (
            <div className="coords">
              {position.coords.latitude.toFixed(5)}, {position.coords.longitude.toFixed(5)}
              {position.coords.accuracy != null && ` · ±${Math.round(position.coords.accuracy)} м`}
            </div>
          )}
          {!position && !error && <div className="map-toast">Шукаю супутники…</div>}
          {error && <div className="map-toast error">{error}</div>}
          {mapFailed && (
            <div className="map-toast error">
              Карта не завантажилась. Трек усе одно записується — перевір інтернет.
            </div>
          )}
        </div>
      </div>

      <div className="hud">
        <div className="speed">
          <span className="speed-value">{Math.round(kmh(stats.speed))}</span>
          <span className="speed-unit">км/год</span>
        </div>

        <div className="metrics">
          <Metric label="Дистанція" value={formatDistance(stats.distance)} />
          <Metric label="Час" value={formatDuration(stats.elapsed)} />
          <Metric label="Макс." value={`${Math.round(kmh(stats.maxSpeed))} км/год`} />
        </div>

        <div className="controls">
          {status === 'idle' && (
            <button className="btn btn-primary btn-big" onClick={start}>
              Старт
            </button>
          )}
          {status === 'recording' && (
            <>
              <button className="btn btn-ghost" onClick={pause}>
                Пауза
              </button>
              <button className="btn btn-stop" onClick={handleStop}>
                Стоп
              </button>
            </>
          )}
          {status === 'paused' && (
            <>
              <button className="btn btn-primary" onClick={resume}>
                Продовжити
              </button>
              <button className="btn btn-stop" onClick={handleStop}>
                Стоп
              </button>
            </>
          )}
        </div>

        {recording && (
          <div className="status-line">
            <span className={`dot ${status === 'recording' ? 'rec' : 'pause'}`} />
            {status === 'recording' ? 'Записую поїздку' : 'На паузі'}
            {wakeLock.held && ' · екран не згасне'}
            {!wakeLock.supported && ' · екран може згаснути'}
          </div>
        )}
      </div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <div className="metric-value">{value}</div>
      <div className="metric-label">{label}</div>
    </div>
  )
}
