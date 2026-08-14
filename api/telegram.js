/**
 * Приймальня Telegram. Сюди бот приносить повідомлення від людей.
 *
 * Єдине, що нас цікавить: коли рідні тиснуть «Старт» за посиланням
 * t.me/бот?start=КОД — з цього ми дізнаємось номер їхнього чату і
 * запамʼятовуємо, кого сповіщати.
 *
 * GET /api/telegram — разове налаштування: прописує цю адресу боту.
 */
import { createHash } from 'node:crypto'

const TTL_SECONDS = 400 * 24 * 60 * 60 // рік з гаком

function storage() {
  const env = process.env
  const urlKey = Object.keys(env).find(
    (k) => /REST_API_URL$|^UPSTASH_REDIS_REST_URL$/.test(k) && env[k]?.startsWith('https://'),
  )
  if (!urlKey) return null
  const writable = (k) => /TOKEN$/.test(k) && !/READ_?ONLY/i.test(k) && env[k]
  const prefix = urlKey.replace(/REST_API_URL$|REST_URL$/, '')
  const tokenKey =
    Object.keys(env).find((k) => k.startsWith(prefix) && writable(k)) ??
    Object.keys(env).find((k) => /REST_API_TOKEN$|REST_TOKEN$/.test(k) && writable(k))
  if (!tokenKey) return null
  return { url: env[urlKey], token: env[tokenKey] }
}

async function pipeline(store, commands) {
  const res = await fetch(`${store.url}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${store.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  })
  if (!res.ok) throw new Error(`Сховище відповіло ${res.status}`)
  return res.json()
}

async function tg(method, payload) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return res.json()
}

/** Таємне слово, яким Telegram підписує свої запити. Виводимо з токена,
 *  щоб не заводити ще одну змінну оточення. */
function webhookSecret() {
  return createHash('sha256')
    .update(`motoapp:${process.env.TELEGRAM_BOT_TOKEN ?? ''}`)
    .digest('hex')
    .slice(0, 48)
}

export default async function handler(req, res) {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    res.status(503).json({ error: 'Бот не налаштований' })
    return
  }

  // Разове налаштування: сказати Telegram, куди приносити повідомлення.
  if (req.method === 'GET') {
    const host = req.headers['x-forwarded-host'] ?? req.headers.host
    const url = `https://${host}/api/telegram`
    const hook = await tg('setWebhook', {
      url,
      secret_token: webhookSecret(),
      allowed_updates: ['message'],
    })
    const me = await tg('getMe', {})
    res.status(200).json({
      webhook: hook.ok ? `налаштовано на ${url}` : hook.description,
      bot: me.ok ? me.result.username : me.description,
    })
    return
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Тільки POST' })
    return
  }

  // Приймаємо лише те, що справді прийшло від Telegram.
  if (req.headers['x-telegram-bot-api-secret-token'] !== webhookSecret()) {
    res.status(401).json({ error: 'Чужий запит' })
    return
  }

  const message = req.body?.message
  const text = message?.text ?? ''
  const chatId = message?.chat?.id
  if (!chatId) {
    res.status(200).json({ ok: true })
    return
  }

  const store = storage()
  const match = text.match(/^\/start\s+([A-Za-z0-9]{4,12})/)

  if (match && store) {
    const code = match[1].toUpperCase()
    const who =
      [message.from?.first_name, message.from?.last_name].filter(Boolean).join(' ') || 'Хтось'
    await pipeline(store, [
      ['HSET', `tg:subs:${code}`, String(chatId), JSON.stringify({ name: who, since: Date.now() })],
      ['EXPIRE', `tg:subs:${code}`, TTL_SECONDS],
    ])
    await tg('sendMessage', {
      chat_id: chatId,
      text:
        'Готово! Тепер ви отримаєте повідомлення, коли райдер вирушить у дорогу та коли прибуде.\n\n' +
        'Під час поїздки тут зʼявиться карта, на якій буде видно, де він зараз.',
    })
  } else if (/^\/stop\b/.test(text)) {
    // Людина більше не хоче сповіщень — прибираємо її з усіх підписок.
    if (store) {
      const [keys] = await pipeline(store, [['KEYS', 'tg:subs:*']])
      const list = keys?.result ?? []
      if (list.length > 0) {
        await pipeline(
          store,
          list.map((k) => ['HDEL', k, String(chatId)]),
        )
      }
    }
    await tg('sendMessage', { chat_id: chatId, text: 'Сповіщення вимкнено.' })
  } else {
    await tg('sendMessage', {
      chat_id: chatId,
      text: 'Щоб отримувати сповіщення, відкрийте посилання, яке надіслав вам райдер.',
    })
  }

  res.status(200).json({ ok: true })
}
