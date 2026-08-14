/**
 * Прокладання маршруту. Працює на сервері Vercel, щоб ключ до служби
 * маршрутів лишався тут і ніколи не потрапляв у телефон.
 *
 * Приймає: { start: [lng, lat], end: [lng, lat], avoidHighways?: boolean }
 * Віддає:  { coordinates, distance, duration, steps }
 */
const ORS = 'https://api.heigit.org/openrouteservice/v2/directions/driving-car/geojson'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Тільки POST' })
    return
  }

  const key = process.env.ORS_API_KEY
  if (!key) {
    res.status(500).json({ error: 'Ключ до служби маршрутів не налаштований' })
    return
  }

  const { start, end, avoidHighways, extras } = req.body ?? {}
  if (!isPoint(start) || !isPoint(end)) {
    res.status(400).json({ error: 'Потрібні точки старту і фінішу' })
    return
  }

  // Українську служба не підтримує, тому беремо англійську заради назв
  // вулиць, а самі маневри формулюємо українською з кодів (див. lib/steps.ts).
  const body = {
    coordinates: [start, end],
    instructions: true,
    language: 'en',
    units: 'm',
  }

  // Додаткові шари по ділянках маршруту (наприклад, обмеження швидкості).
  if (Array.isArray(extras) && extras.length > 0) {
    body.extra_info = extras.filter((e) => typeof e === 'string').slice(0, 5)
  }
  // Цікавіші дороги: просимо оминати автомагістралі й платні ділянки.
  if (avoidHighways) body.options = { avoid_features: ['highways', 'tollways'] }

  try {
    const upstream = await fetch(ORS, {
      method: 'POST',
      headers: {
        Authorization: key,
        'Content-Type': 'application/json',
        Accept: 'application/geo+json',
      },
      body: JSON.stringify(body),
    })

    const data = await upstream.json()

    if (!upstream.ok) {
      const message = data?.error?.message ?? data?.error ?? 'Служба маршрутів відмовила'
      res.status(upstream.status).json({ error: String(message) })
      return
    }

    const feature = data.features?.[0]
    if (!feature) {
      res.status(502).json({ error: 'Маршрут не знайдено' })
      return
    }

    const summary = feature.properties?.summary ?? {}
    const segments = feature.properties?.segments ?? []
    const coordinates = feature.geometry?.coordinates ?? []

    // Розгортаємо маневри в плаский список і одразу підставляємо координати,
    // щоб застосунку не треба було лазити по індексах геометрії.
    const steps = segments.flatMap((seg) =>
      (seg.steps ?? []).map((s) => ({
        instruction: s.instruction,
        name: s.name && s.name !== '-' ? s.name : '',
        distance: s.distance,
        duration: s.duration,
        type: s.type,
        location: coordinates[s.way_points?.[0] ?? 0] ?? null,
        endLocation: coordinates[s.way_points?.[1] ?? 0] ?? null,
      })),
    )

    // Обмеження швидкості: [відІндексу, доІндексу, кмГод] по точках маршруту.
    const maxspeed = (feature.properties?.extras?.maxspeed?.values ?? []).filter(
      (v) => Array.isArray(v) && v.length === 3 && v[2] > 0,
    )

    res.status(200).json({
      coordinates,
      distance: summary.distance ?? 0,
      duration: summary.duration ?? 0,
      steps,
      maxspeed,
      extraKeys: Object.keys(feature.properties?.extras ?? {}),
    })
  } catch (err) {
    res.status(502).json({ error: 'Не вдалося звʼязатися зі службою маршрутів' })
  }
}

function isPoint(p) {
  return (
    Array.isArray(p) &&
    p.length === 2 &&
    Number.isFinite(p[0]) &&
    Number.isFinite(p[1]) &&
    Math.abs(p[0]) <= 180 &&
    Math.abs(p[1]) <= 90
  )
}
