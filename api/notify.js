/**
 * Сповіщення рідним у Telegram.
 *
 * POST { code, event, name, lng, lat, distance?, duration?, destination? }
 *   event = 'start'   — виїхав, і одразу відкриваємо живу карту
 *           'live'    — оновити позицію на тій самій карті
 *           'arrive'  — прибув
 *           'sos'     — лихо
 *
 * GET  /api/notify?code=XXX — хто підписаний і як зветься бот
 */
const TTL_SECONDS = 400 * 24 * 60 * 60
/** Скільки годин жива карта оновлюється, потім Telegram її «заморожує». */
const LIVE_PERIOD = 8 * 60 * 60

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

function flatToMap(flat) {
  const out = new Map()
  if (!Array.isArray(flat)) return out
  for (let i = 0; i + 1 < flat.length; i += 2) out.set(flat[i], flat[i + 1])
  return out
}

function km(meters) {
  return `${(meters / 1000).toFixed(1)} км`
}

function hoursMinutes(ms) {
  const m = Math.round(ms / 60000)
  return m < 60 ? `${m} хв` : `${Math.floor(m / 60)} год ${m % 60} хв`
}

function timeNow() {
  return new Date().toLocaleTimeString('uk-UA', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Kyiv',
  })
}

export default async function handler(req, res) {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    res.status(503).json({ error: 'Бот не налаштований' })
    return
  }
  const store = storage()
  if (!store) {
    res.status(503).json({ error: 'Сховище не налаштоване' })
    return
  }

  // Хто підписаний на цей код і як зветься бот — для екрана налаштувань.
  if (req.method === 'GET') {
    const code = String(req.query?.code ?? '').toUpperCase()
    if (!/^[A-Z0-9]{4,12}$/.test(code)) {
      res.status(400).json({ error: 'Некоректний код' })
      return
    }
    const [subs] = await pipeline(store, [['HGETALL', `tg:subs:${code}`]])
    const me = await tg('getMe', {})
    const people = [...flatToMap(subs?.result).entries()].map(([chatId, raw]) => {
      try {
        const parsed = JSON.parse(raw)
        return { chatId, name: parsed.name, since: parsed.since }
      } catch {
        return { chatId, name: 'Хтось', since: 0 }
      }
    })
    res.status(200).json({ bot: me.ok ? me.result.username : null, people })
    return
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Тільки POST' })
    return
  }

  const { code, event, name, lng, lat, distance, duration, destination, place, remove } =
    req.body ?? {}
  if (typeof code !== 'string' || !/^[A-Za-z0-9]{4,12}$/.test(code)) {
    res.status(400).json({ error: 'Некоректний код' })
    return
  }
  const key = code.toUpperCase()

  // Райдер відписав когось із рідних.
  if (remove) {
    await pipeline(store, [['HDEL', `tg:subs:${key}`, String(remove)]])
    res.status(200).json({ ok: true })
    return
  }

  const [subsRaw, liveRaw] = await pipeline(store, [
    ['HGETALL', `tg:subs:${key}`],
    ['HGETALL', `tg:live:${key}`],
  ])
  const chats = [...flatToMap(subsRaw?.result).keys()]
  const live = flatToMap(liveRaw?.result)
  if (chats.length === 0) {
    res.status(200).json({ ok: true, sent: 0 })
    return
  }

  const who = String(name ?? 'Райдер').slice(0, 24)
  const hasPoint = Number.isFinite(lng) && Number.isFinite(lat)
  const liveUpdates = []

  for (const chatId of chats) {
    if (event === 'start') {
      const where = destination ? `\nКуди: ${String(destination).slice(0, 80)}` : ''
      await tg('sendMessage', {
        chat_id: chatId,
        text: `🏍 ${who} вирушив у дорогу о ${timeNow()}.${where}`,
      })
      if (hasPoint) {
        const sent = await tg('sendLocation', {
          chat_id: chatId,
          latitude: lat,
          longitude: lng,
          live_period: LIVE_PERIOD,
        })
        if (sent.ok) liveUpdates.push(['HSET', `tg:live:${key}`, chatId, String(sent.result.message_id)])
      }
    } else if (event === 'live') {
      const messageId = live.get(chatId)
      if (messageId && hasPoint) {
        await tg('editMessageLiveLocation', {
          chat_id: chatId,
          message_id: Number(messageId),
          latitude: lat,
          longitude: lng,
        })
      }
    } else if (event === 'arrive') {
      const messageId = live.get(chatId)
      if (messageId) {
        await tg('stopMessageLiveLocation', { chat_id: chatId, message_id: Number(messageId) })
      }
      const stats =
        Number.isFinite(distance) && Number.isFinite(duration)
          ? `\n${km(distance)} за ${hoursMinutes(duration)}.`
          : ''
      // «Удома» звучить спокійніше за «на місці» — саме цього чекають.
      const where =
        place === 'home' ? 'удома' : place ? `на місці: ${String(place).slice(0, 40)}` : 'на місці'
      await tg('sendMessage', {
        chat_id: chatId,
        text: `✅ ${who} ${where} о ${timeNow()}.${stats}`,
      })
    } else if (event === 'sos') {
      await tg('sendMessage', {
        chat_id: chatId,
        text:
          `🆘 ${who} не відповідає після можливого падіння!\n\n` +
          (hasPoint
            ? `Координати: ${lat.toFixed(5)}, ${lng.toFixed(5)}\nКарта: https://maps.google.com/?q=${lat},${lng}`
            : 'Координати невідомі.'),
      })
      if (hasPoint) {
        await tg('sendLocation', { chat_id: chatId, latitude: lat, longitude: lng })
      }
    }
  }

  if (event === 'start') {
    await pipeline(store, [
      ...liveUpdates,
      ['EXPIRE', `tg:live:${key}`, LIVE_PERIOD],
      ['EXPIRE', `tg:subs:${key}`, TTL_SECONDS],
    ])
  }
  if (event === 'arrive') {
    await pipeline(store, [['DEL', `tg:live:${key}`]])
  }

  res.status(200).json({ ok: true, sent: chats.length })
}
