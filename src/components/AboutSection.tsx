import { useEffect, useState } from 'react'

/**
 * Версія збірки і стан екрана. Потрібно не для краси: без цього
 * неможливо відрізнити «вада лишилась» від «на телефоні стара версія
 * із кешу», і половина розмов іде намарно.
 */
export function AboutSection() {
  const [updating, setUpdating] = useState(false)
  const [metrics, setMetrics] = useState<Record<string, number>>({})

  useEffect(() => {
    function measure() {
      const probe = document.createElement('div')
      probe.style.cssText =
        'position:fixed;bottom:0;height:env(safe-area-inset-bottom);visibility:hidden'
      document.body.appendChild(probe)
      const safeBottom = probe.getBoundingClientRect().height
      probe.remove()

      setMetrics({
        вікно: Math.round(window.innerHeight),
        видима: Math.round(window.visualViewport?.height ?? 0),
        документ: Math.round(document.documentElement.clientHeight),
        екран: Math.round(window.screen.height),
        застосунок: Math.round(document.querySelector('.app')?.getBoundingClientRect().height ?? 0),
        безпечнийНиз: Math.round(safeBottom),
        щільність: Math.round(window.devicePixelRatio * 100) / 100,
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
        <h3>Про застосунок</h3>
      </div>

      <div className="version-row">
        <div>
          <div className="version-value">версія {__BUILD__.version}</div>
          <div className="muted small">
            {__BUILD__.hash} · зібрано {built}
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
