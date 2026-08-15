import { useEffect, useRef, useState } from 'react'
import { MapView } from '../components/MapView'
import { DestinationSearch } from '../components/DestinationSearch'
import { useRideTracker } from '../hooks/useRideTracker'
import { useWakeLock } from '../hooks/useWakeLock'
import { useNavigation } from '../hooks/useNavigation'
import { useWeather } from '../hooks/useWeather'
import { useGroup } from '../hooks/useGroup'
import { GroupSheet } from '../components/GroupSheet'
import { CrashAlert } from '../components/CrashAlert'
import { useCrashDetect } from '../hooks/useCrashDetect'
import { useStationary } from '../hooks/useStationary'
import { useArrival } from '../hooks/useArrival'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { loadNotify, notifyFamily } from '../lib/notify'
import { freshness } from '../lib/group'
import { haversine } from '../lib/geo'
import { WeatherChip, WeatherStrip } from '../components/WeatherStrip'
import { formatDate, formatDistance, formatDuration, kmh } from '../lib/geo'
import { formatEta, maneuverArrow, maneuverText, speak } from '../lib/steps'

export function TrackScreen({ onFinished }: { onFinished: (rideId: number) => void }) {
  const {
    status,
    stats,
    track,
    position,
    error,
    unfinished,
    start,
    pause,
    resume,
    resumeRide,
    finishAbandoned,
    stop,
  } = useRideTracker()
  const recording = status !== 'idle'
  const wakeLock = useWakeLock(recording)
  const [follow, setFollow] = useState(true)
  const [mapFailed, setMapFailed] = useState(false)
  const [orientation, setOrientation] = useState<'north' | 'course'>('course')
  const [searching, setSearching] = useState(false)
  const [voice, setVoice] = useState(true)
  const [avoidHighways, setAvoidHighways] = useState(true)
  const nav = useNavigation(position, { voice, avoidHighways })
  const weather = useWeather(position, nav.route, voice)
  const group = useGroup(position, voice)
  const [groupSheet, setGroupSheet] = useState(false)
  // Погоду показуємо розгорнутою одразу після прокладання маршруту,
  // а далі райдер згортає її одним дотиком — і повертає так само.
  const [weatherFolded, setWeatherFolded] = useState(false)

  // Панель приладів лежить поверх карти, і її висота весь час різна.
  // Міряємо її, щоб кнопки карти й підпис не ховалися під нею.
  const stackRef = useRef<HTMLDivElement>(null)
  const [stackHeight, setStackHeight] = useState(140)
  useEffect(() => {
    const el = stackRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) => setStackHeight(entry.contentRect.height))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  const [guard, setGuard] = useState(false)
  const crash = useCrashDetect(position, guard)
  const places = useLiveQuery(() => db.places.toArray(), [])
  const home = (places ?? []).find((p) => p.isHome)

  // Нагадування тому, хто забув натиснути «Стоп». Хвилини задаються в
  // адресі лише для перевірки — у житті це 30 хвилин.
  const stopAskMinutes = Number(new URLSearchParams(location.search).get('stopask')) || 30
  const stationary = useStationary(position, recording)
  const [askedAt, setAskedAt] = useState(0)
  const shouldAsk =
    recording && stationary.stationaryMs > stopAskMinutes * 60_000 && Date.now() - askedAt > 60_000

  const arrival = useArrival(
    position,
    recording,
    stationary.stationaryMs,
    places ?? [],
    nav.destination,
  )

  const nextStep = nav.route?.steps[nav.stepIndex + 1] ?? null

  // Питаємо голосом теж — у шоломі банер не побачиш.
  const askedAloud = useRef(false)
  useEffect(() => {
    if (!shouldAsk) {
      askedAloud.current = false
      return
    }
    if (askedAloud.current) return
    askedAloud.current = true
    if (voice) speak('Ти ще їдеш? Якщо поїздку завершено, натисни стоп')
  }, [shouldAsk, voice])

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

  const [destinationLabel, setDestinationLabel] = useState('')
  // Таймер живої карти живе довше за один рендер, тому позицію бере звідси.
  const positionRef = useRef(position)
  positionRef.current = position

  /** Виїзд: рідні отримують повідомлення і живу карту. */
  async function handleStart() {
    await start()
    void notifyFamily(loadNotify(), 'start', {
      lng: position?.coords.longitude,
      lat: position?.coords.latitude,
      destination: destinationLabel || undefined,
    })
  }

  async function handleStop(place?: string) {
    const finished = { distance: stats.distance, duration: stats.elapsed, place }
    const id = await stop()
    void notifyFamily(loadNotify(), 'arrive', finished)
    if (id != null) onFinished(id)
  }

  // Доїхали у своє місце чи у фініш маршруту — завершуємо самі.
  const arrivalHandled = useRef(false)
  useEffect(() => {
    if (!arrival || arrivalHandled.current) return
    arrivalHandled.current = true
    if (voice) speak(`Схоже, ти ${arrival.label}. Поїздку завершено.`)
    void handleStop(arrival.place)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrival])

  useEffect(() => {
    if (!recording) arrivalHandled.current = false
  }, [recording])

  // Поки триває запис — раз на хвилину оновлюємо крапку на карті в
  // Telegram. Частіше не треба: Telegram сам згладжує рух між точками.
  useEffect(() => {
    if (!recording) return
    const timer = setInterval(() => {
      const pos = positionRef.current
      if (!pos) return
      void notifyFamily(loadNotify(), 'live', {
        lng: pos.coords.longitude,
        lat: pos.coords.latitude,
      })
    }, 60_000)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording])

  return (
    <div
      className="screen track-screen"
      style={{ '--stack-h': `${Math.round(stackHeight)}px` } as React.CSSProperties}
    >
      <div className="map-wrap">
        <MapView
          track={track}
          me={me}
          follow={follow}
          orientation={orientation}
          zoomButtons
          route={nav.route?.coordinates ?? null}
          destination={nav.destination}
          riders={group.riders}
          onLongPress={(coords) => {
            primeVoice()
            void nav.navigateTo(coords)
          }}
          onUserMove={() => setFollow(false)}
          onTilesFailed={setMapFailed}
        />
        <div className="map-buttons">
          <button
            className={`follow-btn ${orientation === 'course' ? 'on' : ''}`}
            onClick={() => setOrientation((o) => (o === 'course' ? 'north' : 'course'))}
            aria-label={orientation === 'course' ? 'Карта за рухом' : 'Північ угорі'}
            title={orientation === 'course' ? 'Карта повертається за рухом' : 'Північ угорі'}
          >
            {orientation === 'course' ? '➤' : 'N'}
          </button>
          <button
            className={`follow-btn ${follow ? 'on' : ''}`}
            onClick={() => setFollow((f) => !f)}
            aria-label="Слідувати за мною"
          >
            ◎
          </button>
        </div>

        <div className="map-overlays">
          {/* Координати показуємо лише коли вони справді потрібні: карта не
              завантажилась або GPS ловить погано. Інакше вони тільки
              захаращують екран. */}
          {position && !error && (mapFailed || (position.coords.accuracy ?? 0) > 25) && (
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

        {/* Під час руху позначка запису живе на карті, а не забирає
            окремий рядок у панелі приладів. */}
        {recording && (
          <div className="rec-chip">
            <span className={`dot ${status === 'recording' ? 'rec' : 'pause'}`} />
            {status === 'recording' ? 'Запис' : 'Пауза'}
            {!wakeLock.held && wakeLock.supported && ' · екран може згаснути'}
          </div>
        )}
      </div>

      <div className="bottom-stack" ref={stackRef}>
      {/* Лихо в групі — найважливіше на екрані, тому над усім іншим. */}
      {group.riders
        .filter((r) => r.sos)
        .map((r) => (
          <button
            key={r.id}
            className="sos-banner"
            onClick={() => {
              primeVoice()
              void nav.navigateTo([r.lng, r.lat])
            }}
          >
            <span className="sos-icon">⚠</span>
            <span>
              <b>{r.name}</b> подав сигнал лиха
              {position &&
                ` · ${formatDistance(
                  haversine(position.coords.latitude, position.coords.longitude, r.lat, r.lng),
                )}`}
              <span className="sos-hint">Натисни, щоб прокласти маршрут туди</span>
            </span>
          </button>
        ))}

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

      {nav.route && (
        <WeatherStrip
          points={weather.along}
          traveled={nav.route.distance - nav.remaining}
          collapsed={weatherFolded}
          onToggle={() => setWeatherFolded((v) => !v)}
        />
      )}

      <div className={`hud ${recording ? 'riding' : ''}`}>
        <div className="speed">
          <span className="speed-value">{Math.round(kmh(stats.speed))}</span>
          <span className="speed-unit">км/год</span>
        </div>

        {/* У маршруті цікавить не максималка, а скільки лишилось і коли
            будемо на місці. Просто в накатці — навпаки. */}
        <div className="metrics">
          {nav.route ? (
            <>
              <Metric label="До фінішу" value={formatDistance(nav.remaining)} />
              <Metric
                label="Лишилось"
                value={formatEta(nav.route.duration * (nav.remaining / (nav.route.distance || 1)))}
              />
              <Metric label="Прибуття" value={arrivalClock(nav)} />
            </>
          ) : (
            <>
              <Metric label="Дистанція" value={formatDistance(stats.distance)} />
              <Metric label="Час" value={formatDuration(stats.elapsed)} />
              <Metric label="Макс." value={`${Math.round(kmh(stats.maxSpeed))} км/год`} />
            </>
          )}
        </div>

        {nav.route ? (
          <button className="link-btn" onClick={nav.cancel}>
            Скасувати маршрут
          </button>
        ) : (
          /* Вибір маршруту потрібен до виїзду. Уже в дорозі він лише
             з'їдає карту, тому під час запису його немає. */
          !recording && (
            <div className="controls">
              <button className="btn btn-ghost" onClick={() => setSearching(true)}>
                Куди їдемо?
              </button>
              {home && (
                <button
                  className="btn btn-ghost home-btn"
                  onClick={() => {
                    primeVoice()
                    void nav.navigateTo([home.lng, home.lat])
                  }}
                >
                  🏠 Додому
                </button>
              )}
            </div>
          )
        )}

        {/* Група і стеження за падінням вмикають перед виїздом, тому в
            дорозі цей рядок теж зникає — карті потрібне місце. */}
        {!recording && (
        <div className="status-strip">
          {group.settings ? (
            <div className="group-row">
              <div className="group-riders">
              {group.riders.length === 0 ? (
                <span className="muted">
                  Група {group.settings.code} · чекаю інших
                </span>
              ) : (
                group.riders.map((r) => (
                  <span key={r.id} className="group-rider">
                    <b>{r.name}</b>{' '}
                    {position
                      ? formatDistance(
                          haversine(
                            position.coords.latitude,
                            position.coords.longitude,
                            r.lat,
                            r.lng,
                          ),
                        )
                      : ''}{' '}
                    · {freshness(r.t)}
                  </span>
                ))
              )}
                {group.error && <span className="group-error">{group.error}</span>}
              </div>
              <button className="link-btn" onClick={group.leave}>
                Вийти
              </button>
            </div>
          ) : (
            <button className="link-btn" onClick={() => setGroupSheet(true)}>
              Їду не сам
            </button>
          )}

          {crash.support !== 'unavailable' && (
            <button
              className={`guard-btn ${guard ? 'on' : ''}`}
              title={guard ? 'Стеження за падінням увімкнено' : 'Увімкнути стеження за падінням'}
              aria-label={guard ? 'Стеження за падінням увімкнено' : 'Увімкнути стеження за падінням'}
              onClick={async () => {
                if (guard) {
                  setGuard(false)
                  return
                }
                // Дозвіл на датчики айфон дає лише у відповідь на дотик.
                const ok = await crash.requestPermission()
                if (ok) {
                  setGuard(true)
                  speak('Стеження за падінням увімкнено')
                }
              }}
            >
              🛡
            </button>
          )}
        </div>
        )}

        <div className="controls">
          {status === 'idle' && (
            <button className="btn btn-primary btn-big" onClick={handleStart}>
              Старт
            </button>
          )}
          {status === 'recording' && (
            <>
              <button className="btn btn-ghost" onClick={pause}>
                Пауза
              </button>
              <button className="btn btn-stop" onClick={() => handleStop()}>
                Стоп
              </button>
            </>
          )}
          {status === 'paused' && (
            <>
              <button className="btn btn-primary" onClick={resume}>
                Продовжити
              </button>
              <button className="btn btn-stop" onClick={() => handleStop()}>
                Стоп
              </button>
            </>
          )}
        </div>


        {searching && (
          <DestinationSearch
            near={position ? [position.coords.longitude, position.coords.latitude] : null}
            avoidHighways={avoidHighways}
            onAvoidHighways={setAvoidHighways}
            onPick={(coords, label) => {
              primeVoice()
              setDestinationLabel(label)
              setSearching(false)
              setFollow(true)
              void nav.navigateTo(coords)
            }}
            onClose={() => setSearching(false)}
          />
        )}

        {groupSheet && (
          <GroupSheet
            onJoin={(settings) => {
              group.join(settings)
              setGroupSheet(false)
            }}
            onClose={() => setGroupSheet(false)}
          />
        )}

        {/* Телефон вивантажив застосунок з памʼяті посеред поїздки —
            дані на диску цілі, питаємо, що з ними робити. */}
        {unfinished && status === 'idle' && (
          <div className="ask-stop">
            <span>
              Знайшлась незавершена поїздка від {formatDate(unfinished.startedAt)} —{' '}
              {formatDistance(unfinished.distance)}. Продовжити запис?
            </span>
            <div className="controls">
              <button className="btn btn-ghost" onClick={() => void finishAbandoned(unfinished)}>
                Завершити
              </button>
              <button className="btn btn-primary" onClick={() => void resumeRide(unfinished)}>
                Продовжити
              </button>
            </div>
          </div>
        )}

        {shouldAsk && (
          <div className="ask-stop">
            <span>Стоїш уже {Math.round(stationary.stationaryMs / 60_000)} хв. Поїздку завершено?</span>
            <div className="controls">
              <button
                className="btn btn-ghost"
                onClick={() => {
                  setAskedAt(Date.now())
                  stationary.reset()
                }}
              >
                Ще їду
              </button>
              <button className="btn btn-primary" onClick={() => handleStop()}>
                Так, завершити
              </button>
            </div>
          </div>
        )}

        {crash.suspected && (
          <CrashAlert
            position={position}
            onCancel={crash.dismiss}
            onSos={() => {
              void group.sendSos()
              void notifyFamily(loadNotify(), 'sos', {
                lng: position?.coords.longitude,
                lat: position?.coords.latitude,
              })
            }}
          />
        )}
      </div>
      </div>
    </div>
  )
}

/** Час прибуття годинником: «о 17:42» зрозуміліше за «ще 83 хвилини». */
function arrivalClock(nav: { route: { duration: number; distance: number } | null; remaining: number }) {
  if (!nav.route) return '—'
  const secondsLeft = nav.route.duration * (nav.remaining / (nav.route.distance || 1))
  return new Date(Date.now() + secondsLeft * 1000).toLocaleTimeString('uk-UA', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <div className="metric-value">{value}</div>
      <div className="metric-label">{label}</div>
    </div>
  )
}
