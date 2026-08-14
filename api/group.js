/**
 * Спільна поїздка: кожен райдер надсилає свою позицію і одразу отримує
 * позиції решти групи. Один запит робить обидві справи, щоб не гріти
 * батарею зайвим звʼязком.
 *
 * Дані живуть у сховищі 2 години і зникають самі — ніякої історії
 * пересувань ми не зберігаємо.
 */
const TTL_SECONDS = 2 * 60 * 60
/** Позиції, старші за це, вважаємо мертвими і не показуємо. */
const STALE_MS = 5 * 60 * 1000

function storage() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  return { url, token }
}

async function pipeline(store, commands) {
  const res = await fetch(`${store.url}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${store.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(commands),
  })
  if (!res.ok) throw new Error(`Сховище відповіло ${res.status}`)
  return res.json()
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Тільки POST' })
    return
  }

  const store = storage()
  if (!store) {
    res.status(503).json({ error: 'Спільна поїздка ще не налаштована на сервері' })
    return
  }

  const { code, riderId, name, lng, lat, speed, heading, leaving } = req.body ?? {}

  if (typeof code !== 'string' || !/^[A-Za-z0-9]{4,12}$/.test(code)) {
    res.status(400).json({ error: 'Некоректний код групи' })
    return
  }
  if (typeof riderId !== 'string' || riderId.length < 6 || riderId.length > 64) {
    res.status(400).json({ error: 'Некоректний райдер' })
    return
  }

  const key = `grp:${code.toUpperCase()}`

  try {
    // Виходимо з групи — прибираємо себе і віддаємо решту.
    if (leaving) {
      const [, hgetall] = await pipeline(store, [
        ['HDEL', key, riderId],
        ['HGETALL', key],
      ])
      res.status(200).json({ riders: parseRiders(hgetall?.result, riderId) })
      return
    }

    if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
      res.status(400).json({ error: 'Немає позиції' })
      return
    }

    const payload = JSON.stringify({
      name: String(name ?? 'Райдер').slice(0, 24),
      lng,
      lat,
      speed: Number.isFinite(speed) ? speed : null,
      heading: Number.isFinite(heading) ? heading : null,
      t: Date.now(),
    })

    const [, , hgetall] = await pipeline(store, [
      ['HSET', key, riderId, payload],
      ['EXPIRE', key, TTL_SECONDS],
      ['HGETALL', key],
    ])

    res.status(200).json({ riders: parseRiders(hgetall?.result, riderId) })
  } catch (err) {
    res.status(502).json({ error: 'Сховище недоступне' })
  }
}

/** HGETALL віддає плаский список: поле, значення, поле, значення… */
function parseRiders(flat, selfId) {
  if (!Array.isArray(flat)) return []
  const out = []
  for (let i = 0; i + 1 < flat.length; i += 2) {
    const id = flat[i]
    if (id === selfId) continue
    try {
      const r = JSON.parse(flat[i + 1])
      if (Date.now() - r.t > STALE_MS) continue
      out.push({ id, ...r })
    } catch {
      // Пошкоджений запис просто пропускаємо.
    }
  }
  return out
}
