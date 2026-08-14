/**
 * Служба маршрутів не вміє української, тому маневри формулюємо самі
 * з числових кодів. Ці ж рядки йдуть і на екран, і в гарнітуру.
 */

export interface RouteStep {
  instruction: string
  name: string
  distance: number
  duration: number
  type: number
  location: [number, number] | null
  endLocation: [number, number] | null
}

export interface Route {
  coordinates: [number, number][]
  distance: number
  duration: number
  steps: RouteStep[]
}

const MANEUVERS: Record<number, string> = {
  0: 'поворот ліворуч',
  1: 'поворот праворуч',
  2: 'різкий поворот ліворуч',
  3: 'різкий поворот праворуч',
  4: 'плавно ліворуч',
  5: 'плавно праворуч',
  6: 'прямо',
  7: 'виїзд на кільце',
  8: 'зʼїзд з кільця',
  9: 'розворот',
  10: 'прибуття',
  11: 'початок маршруту',
  12: 'тримайся лівіше',
  13: 'тримайся правіше',
}

/** Короткий текст маневру: «поворот ліворуч на Володимирський узвіз». */
export function maneuverText(step: RouteStep | null | undefined): string {
  if (!step) return ''
  const base = MANEUVERS[step.type] ?? 'далі за маршрутом'
  if (step.type === 10) return 'прибуття на місце'
  if (!step.name) return base
  const preposition = step.type === 6 ? 'по' : 'на'
  return `${base} ${preposition} ${step.name}`
}

/** Те саме, але з дистанцією: «через 300 метрів поворот ліворуч…». */
export function announcement(step: RouteStep | null | undefined, meters: number): string {
  const text = maneuverText(step)
  if (!text) return ''
  if (meters < 100) return text.charAt(0).toUpperCase() + text.slice(1)
  const rounded = meters >= 1000 ? `${(meters / 1000).toFixed(1)} кілометра` : `${Math.round(meters / 50) * 50} метрів`
  return `Через ${rounded} ${text}`
}

/** Стрілка для банера, щоб напрямок читався боковим зором. */
export function maneuverArrow(type: number | undefined): string {
  switch (type) {
    case 0:
    case 2:
    case 4:
    case 12:
      return '←'
    case 1:
    case 3:
    case 5:
    case 13:
      return '→'
    case 9:
      return '⤶'
    case 10:
      return '⚑'
    case 7:
    case 8:
      return '↻'
    default:
      return '↑'
  }
}

/**
 * Промовляє підказку в гарнітуру. Голос вибирається український, якщо
 * система його має; інакше говоритиме тим, що є.
 */
export function speak(text: string) {
  if (!text || typeof speechSynthesis === 'undefined') return
  const u = new SpeechSynthesisUtterance(text)
  u.lang = 'uk-UA'
  u.rate = 1
  const voice = speechSynthesis.getVoices().find((v) => v.lang?.toLowerCase().startsWith('uk'))
  if (voice) u.voice = voice
  speechSynthesis.speak(u)
}

export function formatEta(seconds: number): string {
  const m = Math.round(seconds / 60)
  if (m < 60) return `${m} хв`
  return `${Math.floor(m / 60)} год ${m % 60} хв`
}
