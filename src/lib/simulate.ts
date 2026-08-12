/**
 * Режим симуляції: відкрий застосунок з ?sim=1 — і він вдаватиме, що
 * ти їдеш. Потрібно, щоб перевіряти запис поїздки за столом, без байка.
 * У звичайному режимі цей код не вмикається.
 */
export function installSimulator() {
  const params = new URLSearchParams(location.search)
  if (params.get('sim') !== '1') return

  let lat = 50.4501
  let lng = 30.5234
  let heading = 45
  let t = 0

  function makePosition(): GeolocationPosition {
    t += 1
    // Плавно повертаємо «кермо», щоб трек виглядав як реальна дорога.
    heading += Math.sin(t / 8) * 6
    const speed = 14 + Math.sin(t / 5) * 6 // ~30–70 км/год
    const rad = (heading * Math.PI) / 180
    const step = speed // метрів за секунду ≈ крок за тік
    lat += (step * Math.cos(rad)) / 111_320
    lng += (step * Math.sin(rad)) / (111_320 * Math.cos((lat * Math.PI) / 180))
    return {
      coords: {
        latitude: lat,
        longitude: lng,
        altitude: 150 + Math.sin(t / 12) * 25,
        accuracy: 8,
        altitudeAccuracy: 5,
        heading,
        speed,
        toJSON: () => ({}),
      },
      timestamp: Date.now(),
      toJSON: () => ({}),
    } as GeolocationPosition
  }

  const timers = new Map<number, ReturnType<typeof setInterval>>()
  let nextId = 1

  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      watchPosition(cb: PositionCallback) {
        const id = nextId++
        cb(makePosition())
        timers.set(id, setInterval(() => cb(makePosition()), 1000))
        return id
      },
      clearWatch(id: number) {
        const timer = timers.get(id)
        if (timer) clearInterval(timer)
        timers.delete(id)
      },
      getCurrentPosition(cb: PositionCallback) {
        cb(makePosition())
      },
    },
  })

  console.info('[MotoApp] Режим симуляції увімкнено')
}
