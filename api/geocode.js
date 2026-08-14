/**
 * Пошук місця за назвою («Умань», «Софіївський парк»). Як і маршрут,
 * ходить до служби зі сторони сервера, щоб не світити ключ.
 *
 * GET /api/geocode?q=умань&lng=30.5&lat=50.4
 * lng/lat — необовʼязкові: якщо є, результати поруч будуть вище.
 */
const ORS = 'https://api.heigit.org/openrouteservice/geocode/search'

export default async function handler(req, res) {
  const key = process.env.ORS_API_KEY
  if (!key) {
    res.status(500).json({ error: 'Ключ до служби маршрутів не налаштований' })
    return
  }

  const q = (req.query?.q ?? '').toString().trim()
  if (q.length < 2) {
    res.status(200).json({ places: [] })
    return
  }

  const params = new URLSearchParams({ api_key: key, text: q, size: '8' })
  const lng = Number(req.query?.lng)
  const lat = Number(req.query?.lat)
  if (Number.isFinite(lng) && Number.isFinite(lat)) {
    params.set('focus.point.lon', String(lng))
    params.set('focus.point.lat', String(lat))
  }

  try {
    const upstream = await fetch(`${ORS}?${params}`)
    const data = await upstream.json()

    if (!upstream.ok) {
      res.status(upstream.status).json({ error: 'Пошук не вдався' })
      return
    }

    const places = (data.features ?? []).map((f) => ({
      label: f.properties?.label ?? f.properties?.name ?? 'Без назви',
      region: [f.properties?.county, f.properties?.region, f.properties?.country]
        .filter(Boolean)
        .join(', '),
      coords: f.geometry?.coordinates ?? null,
    }))

    res.status(200).json({ places: places.filter((p) => p.coords) })
  } catch {
    res.status(502).json({ error: 'Не вдалося звʼязатися зі службою пошуку' })
  }
}
