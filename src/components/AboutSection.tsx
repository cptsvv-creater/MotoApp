import { useEffect, useState } from 'react'
import { setBannerStyle, useBannerStyle } from '../lib/prefs'

/**
 * Версія збірки і стан екрана. Потрібно не для краси: без цього
 * неможливо відрізнити «вада лишилась» від «на телефоні стара версія
 * із кешу», і половина розмов іде намарно.
 */
export function AboutSection() {
  const banner = useBannerStyle()
  const [updating, setUpdating] = useState(false)
  const [metrics, setMetrics] = useState<Record<string, number>>({})

  useEffect(() => {
    function measure() {
      const probe = (side: 'top' | 'bottom') => {
        const el = document.createElement('div')
        el.style.cssText = `position:fixed;${side}:0;height:env(safe-area-inset-${side});visibility:hidden`
        document.body.appendChild(el)
        const h = el.getBoundingClientRect().height
        el.remove()
        return Math.round(h)
      }

      setMetrics({
        'вікно ↕': Math.round(window.innerHeight),
        'вікно ↔': Math.round(window.innerWidth),
        'екран ↕': Math.round(window.screen.height),
        'екран ↔': Math.round(window.screen.width),
        застосунок: Math.round(document.querySelector('.app')?.getBoundingClientRect().height ?? 0),
        'відступ ↑': probe('top'),
        'відступ ↓': probe('bottom'),
        щільність: Math.round(window.devicePixelRatio * 100) / 100,
        // Найважливіше: чи запущено з іконки, чи це звичайна вкладка Safari.
        зІконки: window.matchMedia('(display-mode: standalone)').matches ? 1 : 0,
      })
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  /** Змушує телефон викинути стару версію з кешу і взяти свіжу. */
  async function forceUpdate() {
    setUpdating(true)
    try {
      const registrations = await navigator.serviceWorker?.getRegistrations()
      await Promise.all((registrations ?? []).map((r) => r.update()))
      const keys = await caches.keys()
      await Promise.all(keys.map((k) => caches.delete(k)))
    } catch {
      // Навіть якщо не вдалось — перезавантаження часто рятує саме собою.
    }
    location.reload()
  }

  const built = new Date(__BUILD__.time).toLocaleString('uk-UA', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <div className="about">
      <div className="section-head">
        <h3>Вигляд банера маневру</h3>
      </div>
      <div className="controls">
        <button
          className={`btn ${banner === 'solid' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setBannerStyle('solid')}
        >
          Суцільний
        </button>
        <button
          className={`btn ${banner === 'glass' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setBannerStyle('glass')}
        >
          Напівпрозорий
        </button>
      </div>
      <p className="muted small">
        На ходу перемикається довгим натисканням на сам банер — щоб порівняти в дорозі, а не за
        столом.
      </p>

      <div className="section-head">
        <h3>Про застосунок</h3>
      </div>

      <div className="version-row">
        <div>
          <div className="version-value">збірка {__BUILD__.version}</div>
          <div className="muted small">
            {__BUILD__.hash} · {built}
          </div>
        </div>
        <button className="btn btn-ghost" onClick={forceUpdate} disabled={updating}>
          {updating ? 'Оновлюю…' : 'Оновити'}
        </button>
      </div>

      <details className="diag">
        <summary className="muted small">Діагностика екрана</summary>
        <div className="diag-grid">
          {Object.entries(metrics).map(([name, value]) => (
            <div key={name}>
              <b>{value}</b> {name}
            </div>
          ))}
        </div>
      </details>
    </div>
  )
}
