import { useEffect, useState } from 'react'

/**
 * Дрібні уподобання вигляду. Живуть у памʼяті телефона й міняються
 * на льоту: екран поїздки лишається змонтованим, поки ти в гаражі,
 * тому про зміну повідомляємо подією, а не перезавантаженням.
 */

export type BannerStyle = 'solid' | 'glass'

/**
 * Як поводиться масштаб карти в дорозі:
 *  manual   — тільки як поставив райдер, застосунок не втручається;
 *  auto     — сам віддаляється зі швидкістю від власних значень;
 *  anchored — те саме, але відлік ведеться від масштабу, який обрав
 *             райдер: він задає найближчий вигляд, а швидкість лише
 *             віддаляє від нього. Автоматика ніколи не скасовує вибір.
 */
export type ZoomMode = 'manual' | 'auto' | 'anchored'

/**
 * Вигляд карти: пласка згори чи з нахилом і обʼємними будівлями.
 * У навігаторах це те саме «2D/3D», і воно змінює не лише будівлі, а й
 * кут камери — без нахилу обʼєм не видно взагалі, лише дахи.
 */
export type MapView = '2d' | '3d'

const KEY = 'motoapp.banner'
const VIEW_KEY = 'motoapp.mapView'
const ZOOM_KEY = 'motoapp.zoomMode'
const ANCHOR_KEY = 'motoapp.zoomAnchor'
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
  return usePref(getBannerStyle)
}

export function getZoomMode(): ZoomMode {
  const stored = localStorage.getItem(ZOOM_KEY)
  return stored === 'auto' || stored === 'manual' ? stored : 'anchored'
}

export function setZoomMode(value: ZoomMode) {
  localStorage.setItem(ZOOM_KEY, value)
  window.dispatchEvent(new CustomEvent(EVENT))
}

export function useZoomMode(): ZoomMode {
  return usePref(getZoomMode)
}

/** Масштаб, який райдер вважає своїм — той, що на найповільнішому русі. */
export function getZoomAnchor(): number {
  const stored = Number(localStorage.getItem(ANCHOR_KEY))
  return Number.isFinite(stored) && stored >= 8 && stored <= 19 ? stored : 16
}

export function setZoomAnchor(value: number) {
  localStorage.setItem(ANCHOR_KEY, String(Math.round(value * 100) / 100))
  window.dispatchEvent(new CustomEvent(EVENT))
}

export function useZoomAnchor(): number {
  return usePref(getZoomAnchor)
}

/** Типово пласка: обʼєм подобається не всім, і його вмикають свідомо. */
export function getMapView(): MapView {
  return localStorage.getItem(VIEW_KEY) === '3d' ? '3d' : '2d'
}

export function setMapView(value: MapView) {
  localStorage.setItem(VIEW_KEY, value)
  window.dispatchEvent(new CustomEvent(EVENT))
}

export function useMapView(): MapView {
  return usePref(getMapView)
}

function usePref<T>(read: () => T): T {
  const [value, setValue] = useState<T>(read)
  useEffect(() => {
    const update = () => setValue(read())
    window.addEventListener(EVENT, update)
    return () => window.removeEventListener(EVENT, update)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return value
}
