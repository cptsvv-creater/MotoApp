import { useEffect, useState } from 'react'

/**
 * Дрібні уподобання вигляду. Живуть у памʼяті телефона й міняються
 * на льоту: екран поїздки лишається змонтованим, поки ти в гаражі,
 * тому про зміну повідомляємо подією, а не перезавантаженням.
 */

export type BannerStyle = 'solid' | 'glass'

const KEY = 'motoapp.banner'
const EVENT = 'motoapp:prefs'

/** Типово напівпрозорий: крізь нього видно позначку запису й підказки. */
export function getBannerStyle(): BannerStyle {
  return localStorage.getItem(KEY) === 'solid' ? 'solid' : 'glass'
}

export function setBannerStyle(value: BannerStyle) {
  localStorage.setItem(KEY, value)
  window.dispatchEvent(new CustomEvent(EVENT))
}

export function useBannerStyle(): BannerStyle {
  const [value, setValue] = useState<BannerStyle>(getBannerStyle)
  useEffect(() => {
    const update = () => setValue(getBannerStyle())
    window.addEventListener(EVENT, update)
    return () => window.removeEventListener(EVENT, update)
  }, [])
  return value
}
