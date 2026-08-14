import { useEffect, useRef, useState } from 'react'
import { speak } from '../lib/steps'

/** Скільки секунд райдер має, щоб сказати «все гаразд». */
const COUNTDOWN = 30

/**
 * Екран після виявленого падіння. Гучний, простий і з однією великою
 * кнопкою: у рукавиці й у стресі влучити треба з першого разу.
 */
export function CrashAlert({
  position,
  onCancel,
  onSos,
}: {
  position: GeolocationPosition | null
  onCancel: () => void
  onSos: () => void
}) {
  const [left, setLeft] = useState(COUNTDOWN)
  const firedRef = useRef(false)
  const audioRef = useRef<AudioContext | null>(null)

  const lat = position?.coords.latitude
  const lng = position?.coords.longitude

  useEffect(() => {
    speak('Виявлено падіння. Скасуй, якщо все гаразд.')

    // Сирена: короткий сигнал щосекунди, щоб почули і поруч, і в шоломі.
    let ctx: AudioContext | null = null
    try {
      ctx = new AudioContext()
      audioRef.current = ctx
    } catch {
      ctx = null
    }

    function beep() {
      if (!ctx) return
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.frequency.value = 880
      gain.gain.value = 0.25
      osc.connect(gain).connect(ctx.destination)
      osc.start()
      osc.stop(ctx.currentTime + 0.25)
    }

    beep()
    const beeper = setInterval(beep, 1000)
    const ticker = setInterval(() => setLeft((v) => v - 1), 1000)

    return () => {
      clearInterval(beeper)
      clearInterval(ticker)
      ctx?.close().catch(() => {})
    }
  }, [])

  useEffect(() => {
    if (left > 0 || firedRef.current) return
    firedRef.current = true
    onSos()
  }, [left, onSos])

  const coords = lat != null && lng != null ? `${lat.toFixed(5)}, ${lng.toFixed(5)}` : 'невідомі'
  const smsText = encodeURIComponent(
    `Можливо, я потрапив у аварію. Мої координати: ${coords}. Карта: https://maps.google.com/?q=${lat},${lng}`,
  )

  return (
    <div className="crash-overlay">
      {left > 0 ? (
        <>
          <div className="crash-title">Виявлено падіння</div>
          <div className="crash-count">{left}</div>
          <p className="crash-text">
            Через {left} с застосунок повідомить групу і покаже виклик допомоги.
          </p>
          <button className="btn btn-primary btn-big crash-cancel" onClick={onCancel}>
            Я в порядку
          </button>
        </>
      ) : (
        <>
          <div className="crash-title">Потрібна допомога</div>
          <p className="crash-text">
            Групу сповіщено. Координати: <b>{coords}</b>
          </p>
          <a className="btn btn-stop crash-call" href="tel:112">
            Подзвонити 112
          </a>
          <a className="btn btn-ghost" href={`sms:?&body=${smsText}`}>
            Надіслати координати рідним
          </a>
          <button className="btn btn-ghost" onClick={onCancel}>
            Скасувати тривогу
          </button>
        </>
      )}
    </div>
  )
}
