import type { ServiceItem } from '../db'

export type ServiceStatus = 'ok' | 'soon' | 'overdue'

export interface ServiceState {
  status: ServiceStatus
  /** Скільки км лишилось (відʼємне — прострочено). null, якщо інтервал не в км. */
  kmLeft: number | null
  /** Скільки днів лишилось (відʼємне — прострочено). null, якщо інтервал не в днях. */
  daysLeft: number | null
  /** Частка пройденого інтервалу, 0..1+ — для смужки прогресу. */
  progress: number
  /** Короткий підсумок для картки. */
  label: string
}

const DAY = 24 * 60 * 60 * 1000

/**
 * Рахує, наскільки близько обслуговування. Якщо задано і кілометри,
 * і дні — бере те, що настає раніше: олива старіє і від пробігу, і від часу.
 */
export function serviceState(item: ServiceItem, currentOdo: number, now = Date.now()): ServiceState {
  const kmLeft = item.intervalKm ? item.lastDoneOdo + item.intervalKm - currentOdo : null
  const daysLeft = item.intervalDays
    ? Math.ceil((item.lastDoneAt + item.intervalDays * DAY - now) / DAY)
    : null

  const kmProgress = item.intervalKm ? 1 - (kmLeft as number) / item.intervalKm : 0
  const dayProgress = item.intervalDays ? 1 - (daysLeft as number) / item.intervalDays : 0
  const progress = Math.max(kmProgress, dayProgress)

  // «Скоро» — коли лишилась десята частина інтервалу.
  const kmSoon = item.intervalKm != null && (kmLeft as number) <= item.intervalKm * 0.1
  const daySoon = item.intervalDays != null && (daysLeft as number) <= item.intervalDays * 0.1
  const overdue = (kmLeft != null && kmLeft <= 0) || (daysLeft != null && daysLeft <= 0)

  const status: ServiceStatus = overdue ? 'overdue' : kmSoon || daySoon ? 'soon' : 'ok'

  return { status, kmLeft, daysLeft, progress: Math.min(Math.max(progress, 0), 1), label: labelFor(status, kmLeft, daysLeft) }
}

function labelFor(status: ServiceStatus, kmLeft: number | null, daysLeft: number | null): string {
  if (status === 'overdue') {
    if (kmLeft != null && kmLeft <= 0) return `прострочено на ${Math.abs(Math.round(kmLeft))} км`
    if (daysLeft != null && daysLeft <= 0) return `прострочено на ${Math.abs(daysLeft)} дн.`
    return 'прострочено'
  }
  const parts: string[] = []
  if (kmLeft != null) parts.push(`${Math.round(kmLeft)} км`)
  if (daysLeft != null) parts.push(`${daysLeft} дн.`)
  return `через ${parts.join(' або ')}`
}

/** Пункти, з яких зазвичай починають: типові інтервали для дорожнього байка. */
export const DEFAULT_ITEMS: Array<Pick<ServiceItem, 'title' | 'intervalKm' | 'intervalDays'>> = [
  { title: 'Мастило ланцюга', intervalKm: 500, intervalDays: null },
  { title: 'Заміна оливи та фільтра', intervalKm: 6000, intervalDays: 365 },
  { title: 'Гальмівні колодки', intervalKm: 15000, intervalDays: null },
  { title: 'Шини', intervalKm: 12000, intervalDays: null },
  { title: 'Повітряний фільтр', intervalKm: 12000, intervalDays: null },
  { title: 'Гальмівна рідина', intervalKm: null, intervalDays: 730 },
]
