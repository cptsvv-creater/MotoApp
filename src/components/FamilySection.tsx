import { useCallback, useEffect, useState } from 'react'
import {
  fetchSubscribers,
  loadNotify,
  removeSubscriber,
  saveNotify,
  type NotifySettings,
  type Subscriber,
} from '../lib/notify'
import { randomCode } from '../lib/group'

/**
 * Налаштування сповіщень рідним. Живе в гаражі, а не на екрані поїздки:
 * це те, що робиш один раз удома, а не на ходу.
 */
export function FamilySection() {
  const [settings, setSettings] = useState<NotifySettings>(() => loadNotify())
  const [bot, setBot] = useState<string | null>(null)
  const [people, setPeople] = useState<Subscriber[]>([])
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const data = await fetchSubscribers(settings.code)
      setBot(data.bot)
      setPeople(data.people)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не вдалося отримати список')
    }
  }, [settings.code])

  useEffect(() => {
    void refresh()
  }, [refresh])

  function update(next: Partial<NotifySettings>) {
    const merged = { ...settings, ...next }
    setSettings(merged)
    saveNotify(merged)
  }

  const link = bot ? `https://t.me/${bot}?start=${settings.code}` : null

  return (
    <div className="family">
      <div className="section-head">
        <h3>Сповіщення рідним</h3>
      </div>

      {error && <p className="muted small">{error}</p>}

      <label className="field">
        <span>Як тебе підписувати в повідомленнях</span>
        <input
          value={settings.name}
          onChange={(e) => update({ name: e.target.value })}
          placeholder="Денис"
        />
      </label>

      <label className="checkbox">
        <input
          type="checkbox"
          checked={settings.enabled}
          onChange={(e) => update({ enabled: e.target.checked })}
        />
        <span>Повідомляти про виїзд, прибуття і падіння</span>
      </label>

      {link && (
        <>
          <p className="muted small">
            Надішли це посилання тим, хто має знати, що ти в дорозі. Вони тиснуть «Старт» — і
            більше нічого робити не треба.
          </p>
          <div className="link-row">
            <code className="invite-link">{link}</code>
            <button
              className="btn btn-ghost"
              onClick={async () => {
                try {
                  if (navigator.share) await navigator.share({ url: link })
                  else await navigator.clipboard.writeText(link)
                  setCopied(true)
                  setTimeout(() => setCopied(false), 2000)
                } catch {
                  // Користувач передумав ділитись — нічого не робимо.
                }
              }}
            >
              {copied ? 'Скопійовано' : 'Поділитися'}
            </button>
          </div>
        </>
      )}

      <div className="section-head">
        <h3>Хто отримує</h3>
        <button className="link-btn" onClick={refresh}>
          Оновити
        </button>
      </div>

      {confirmReset ? (
        <div className="confirm">
          <span>
            Створити нове посилання? Усі, хто підписаний за старим, перестануть отримувати
            повідомлення — доведеться надіслати їм нове.
          </span>
          <button
            className="btn btn-stop"
            onClick={() => {
              update({ code: randomCode() })
              setConfirmReset(false)
              setPeople([])
            }}
          >
            Так, нове посилання
          </button>
          <button className="btn btn-ghost" onClick={() => setConfirmReset(false)}>
            Скасувати
          </button>
        </div>
      ) : (
        <button className="link-btn danger" onClick={() => setConfirmReset(true)}>
          Змінити посилання
        </button>
      )}

      {people.length === 0 ? (
        <p className="muted small">Поки ніхто. Надішли посилання вище.</p>
      ) : (
        <ul className="log-list">
          {people.map((p) => (
            <li key={p.chatId} className="log-row">
              <div className="log-title">{p.name}</div>
              <button
                className="link-btn"
                onClick={async () => {
                  await removeSubscriber(settings.code, p.chatId)
                  void refresh()
                }}
              >
                Прибрати
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
