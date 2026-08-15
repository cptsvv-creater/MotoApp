import { isNasty, weatherIcon, weatherText, type WeatherPoint } from '../lib/weather'

/**
 * Смужка прогнозу вздовж маршруту. Відстані рахуються від того місця,
 * де райдер зараз, а не від старту: інакше через сотню кілометрів вони
 * показували б минуле. Пройдені точки зникають самі.
 */
export function WeatherStrip({
  points,
  traveled = 0,
  collapsed = false,
  onToggle,
}: {
  points: WeatherPoint[]
  /** Скільки метрів маршруту вже пройдено */
  traveled?: number
  collapsed?: boolean
  onToggle?: () => void
}) {
  const ahead = points.filter((p) => p.atDistance >= traveled - 500)
  if (ahead.length === 0) return null

  if (collapsed) {
    const worst = ahead.find(isNasty) ?? ahead[0]
    const km = Math.max(0, Math.round((worst.atDistance - traveled) / 1000))
    return (
      <button className={`weather-folded ${isNasty(worst) ? 'nasty' : ''}`} onClick={onToggle}>
        {weatherIcon(worst.code)} {Math.round(worst.temp)}°
        {isNasty(worst) && ` · ${weatherText(worst.code)}${km > 1 ? ` через ${km} км` : ' попереду'}`}
        <span className="weather-more">погода ⌄</span>
      </button>
    )
  }

  return (
    <div className="weather-strip" onClick={onToggle}>
      {ahead.map((p, i) => {
        const left = Math.round((p.atDistance - traveled) / 1000)
        return (
        <div key={i} className={`weather-chip ${isNasty(p) ? 'nasty' : ''}`}>
          <div className="weather-when">{left <= 1 ? 'тут' : `+${left} км`}</div>
          <div className="weather-icon">{weatherIcon(p.code)}</div>
          <div className="weather-temp">{Math.round(p.temp)}°</div>
          {/* Підпис лишаємо тільки там, де він щось означає — щоб смужка
              не перетворювалась на стіну тексту. */}
          {isNasty(p) && (
            <div className="weather-note">
              {p.precip >= 0.2 ? `${p.precip.toFixed(1)} мм` : weatherText(p.code)}
            </div>
          )}
          {p.gust >= 60 && <div className="weather-wind">вітер {Math.round(p.gust)}</div>}
        </div>
        )
      })}
    </div>
  )
}

/** Погода в поточній точці — для екрана без маршруту. */
export function WeatherChip({ point }: { point: WeatherPoint }) {
  return (
    <div className={`coords weather-now ${isNasty(point) ? 'nasty' : ''}`}>
      {weatherIcon(point.code)} {Math.round(point.temp)}° · {weatherText(point.code)}
      {point.gust >= 40 && ` · пориви ${Math.round(point.gust)} км/год`}
    </div>
  )
}
