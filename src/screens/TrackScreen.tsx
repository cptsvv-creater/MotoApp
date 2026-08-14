import { useState } from 'react'
import { MapView } from '../components/MapView'
import { DestinationSearch } from '../components/DestinationSearch'
import { useRideTracker } from '../hooks/useRideTracker'
import { useWakeLock } from '../hooks/useWakeLock'
import { useNavigation } from '../hooks/useNavigation'
import { useWeather } from '../hooks/useWeather'
import { WeatherChip, WeatherStrip } from '../components/WeatherStrip'
import { formatDistance, formatDuration, kmh } from '../lib/geo'
import { formatEta, maneuverArrow, maneuverText, speak } from '../lib/steps'

export function TrackScreen({ onFinished }: { onFinished: (rideId: number) => void }) {
  const { status, stats, track, position, error, start, pause, resume, stop } = useRideTracker()
  const recording = status !== 'idle'
  const wakeLock = useWakeLock(recording)
  const [follow, setFollow] = useState(true)
  const [mapFailed, setMapFailed] = useState(false)
  const [searching, setSearching] = useState(false)
  const [voice, setVoice] = useState(true)
  const [avoidHighways, setAvoidHighways] = useState(true)
  const nav = useNavigation(position, { voice, avoidHighways })
  const weather = useWeather(position, nav.route, voice)

  const nextStep = nav.route?.steps[nav.stepIndex + 1] ?? null

  const me = position
    ? {
        lng: position.coords.longitude,
        lat: position.coords.latitude,
        heading: position.coords.heading,
      }
    : null

  /**
   * Safari на айфоні дозволяє озвучення лише у відповідь на дотик — першу
   * фразу треба сказати прямо в обробнику натискання, інакше всі наступні
   * підказки в дорозі будуть мовчки пропадати.
   */
  function primeVoice() {
    if (voice) speak('Прокладаю маршрут')
  }

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
          zoomButtons
          route={nav.route?.coordinates ?? null}
          destination={nav.destination}
          onLongPress={(coords) => {
            primeVoice()
            void nav.navigateTo(coords)
          }}
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
          {nav.loading && <div className="map-toast">Прокладаю маршрут…</div>}
          {nav.error && <div className="map-toast error">{nav.error}</div>}
          {weather.current && !nav.route && <WeatherChip point={weather.current} />}
        </div>
      </div>

      {/* Маневр — одразу під картою: це те, на що дивишся на ходу. */}
      {nav.route && nextStep && (
        <div className={`nav-banner ${nav.offRoute ? 'off' : ''}`}>
          <span className="nav-arrow">{maneuverArrow(nextStep.type)}</span>
          <div className="nav-text">
            <div className="nav-distance">
              {nav.offRoute ? 'Не на маршруті' : formatDistance(nav.toManeuver)}
            </div>
            <div className="nav-instruction">{maneuverText(nextStep)}</div>
          </div>
          <button
            className={`voice-btn ${voice ? 'on' : ''}`}
            onClick={() => {
              const next = !voice
              setVoice(next)
              if (next) speak('Голосові підказки увімкнено')
              else speechSynthesis?.cancel()
            }}
            aria-label="Голосові підказки"
          >
            {voice ? '🔊' : '🔇'}
          </button>
        </div>
      )}

      {nav.route && <WeatherStrip points={weather.along} />}

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

        {nav.route ? (
          <div className="route-summary">
            <div>
              <b>{formatDistance(nav.remaining)}</b> до фінішу ·{' '}
              {formatEta(nav.route.duration * (nav.remaining / (nav.route.distance || 1)))}
            </div>
            <button className="link-btn" onClick={nav.cancel}>
              Скасувати
            </button>
          </div>
        ) : (
          <button className="btn btn-ghost" onClick={() => setSearching(true)}>
            Куди їдемо?
          </button>
        )}

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

        {searching && (
          <DestinationSearch
            near={position ? [position.coords.longitude, position.coords.latitude] : null}
            avoidHighways={avoidHighways}
            onAvoidHighways={setAvoidHighways}
            onPick={(coords) => {
              primeVoice()
              setSearching(false)
              setFollow(true)
              void nav.navigateTo(coords)
            }}
            onClose={() => setSearching(false)}
          />
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
