import { ManeuverIcon } from './ManeuverIcon'
import { maneuverText } from '../lib/steps'

/**
 * Усі маневри поруч — щоб звірити піктограми між собою. Відкривається
 * з адреси ?icons=1 і в звичайній роботі застосунку не бере участі.
 */
export function ManeuverIconPreview() {
  const types = [11, 6, 4, 5, 0, 1, 2, 3, 12, 13, 7, 8, 9, 10]
  return (
    <div className="screen pad scroll">
      <h2>Піктограми маневрів</h2>
      <div className="icon-grid">
        {types.map((t) => (
          <div key={t} className="icon-cell">
            <span className="nav-arrow">
              <ManeuverIcon type={t} />
            </span>
            <div className="muted small">{maneuverText({ type: t, name: '' } as never)}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
