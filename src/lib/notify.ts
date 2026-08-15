import { randomCode } from './group'

/**
 * Сповіщення рідним. Код тут інший, ніж код групи: група — це ті, з ким
 * ти їдеш, а це ті, хто чекає вдома. Плутати їх не можна.
 */

export interface NotifySettings {
  code: string
  /** Як райдера підписувати в повідомленнях */
  name: string
  enabled: boolean
}

export interface Subscriber {
  chatId: string
  name: string
  since: number
}

const KEY = 'motoapp.notify'

export function loadNotify(): NotifySettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as NotifySettings
  } catch {
    // Зіпсовані налаштування просто замінюємо новими.
  }
  const fresh: NotifySettings = { code: randomCode(), name: '', enabled: false }
  localStorage.setItem(KEY, JSON.stringify(fresh))
  return fresh
}

export function saveNotify(settings: NotifySettings) {
  localStorage.setItem(KEY, JSON.stringify(settings))
}

export async function fetchSubscribers(
  code: string,
): Promise<{ bot: string | null; people: Subscriber[] }> {
  const res = await fetch(`/api/notify?code=${encodeURIComponent(code)}`)
  if (!res.ok) throw new Error((await res.json()).error ?? 'Не вдалося отримати список')
  return res.json()
}

export async function removeSubscriber(code: string, chatId: string) {
  await fetch('/api/notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, remove: chatId }),
  })
}

type NotifyEvent = 'start' | 'live' | 'arrive' | 'sos'

export async function notifyFamily(
  settings: NotifySettings,
  event: NotifyEvent,
  payload: {
    lng?: number
    lat?: number
    distance?: number
    duration?: number
    destination?: string
    /** 'home' або назва свого місця — щоб повідомлення було людським */
    place?: string
  } = {},
) {
  if (!settings.enabled) return
  try {
    await fetch('/api/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: settings.code, event, name: settings.name || 'Райдер', ...payload }),
    })
  } catch {
    // Немає звʼязку — сповіщення просто не піде. Наступна подія спробує знову.
  }
}
