import { isNasty, weatherIcon, weatherText, type WeatherPoint } from '../lib/weather'

/** Смужка прогнозу вздовж маршруту: де і що нас чекає. */
export function WeatherStrip({ points }: { points: WeatherPoint[] }) {
  if (points.length === 0) return null

  return (
    <div className="weather-strip">
      {points.map((p, i) => (
        <div key={i} className={`weather-chip ${isNasty(p) ? 'nasty' : ''}`}>
          <div className="weather-when">
            {i === 0 ? 'зараз' : `+${Math.round(p.atDistance / 1000)} км`}
          </div>
          <div className="weather-icon">{weatherIcon(p.code)}</div>
          <div className="weather-temp">{Math.round(p.temp)}°</div>
          <div className="weather-note">
            {p.precip >= 0.2 ? `${p.precip.toFixed(1)} мм` : weatherText(p.code)}
          </div>
          {p.gust >= 60 && <div className="weather-wind">вітер {Math.round(p.gust)}</div>}
        </div>
      ))}
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
