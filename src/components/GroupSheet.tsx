import { useState } from 'react'
import { newRiderId, randomCode, type GroupSettings } from '../lib/group'

/**
 * Приєднання до спільної поїздки. Робиться один раз: далі код лежить
 * у памʼяті телефона, і застосунок сам ділиться позицією.
 */
export function GroupSheet({
  onJoin,
  onClose,
}: {
  onJoin: (settings: GroupSettings) => void
  onClose: () => void
}) {
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [created, setCreated] = useState<string | null>(null)

  function create() {
    const fresh = randomCode()
    setCreated(fresh)
    setCode(fresh)
  }

  function join() {
    const clean = code.trim().toUpperCase()
    if (!/^[A-Z0-9]{4,12}$/.test(clean)) return
    onJoin({ code: clean, name: name.trim() || 'Райдер', riderId: newRiderId() })
  }

  return (
    <div className="search-overlay">
      <div className="search-bar">
        <h2 className="sheet-heading">Спільна поїздка</h2>
        <button className="search-close" onClick={onClose}>
          Закрити
        </button>
      </div>

      <div className="scroll">
        <p className="muted small">
          Ви бачитимете одне одного на карті, поки застосунок відкритий. Код вводиться один раз —
          далі нічого робити не треба.
        </p>

        <label className="field">
          <span>Як тебе підписати</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Денис" />
        </label>

        <label className="field">
          <span>Код групи</span>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="K7QM2F"
            autoCapitalize="characters"
            maxLength={12}
          />
        </label>

        {created && (
          <div className="code-hint">
            Продиктуй цей код тим, з ким їдеш: <b>{created}</b>
          </div>
        )}

        <div className="controls">
          <button className="btn btn-ghost" onClick={create}>
            Створити код
          </button>
          <button className="btn btn-primary" onClick={join} disabled={code.trim().length < 4}>
            Приєднатися
          </button>
        </div>
      </div>
    </div>
  )
}
