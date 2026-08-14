/**
 * Налаштування спільної поїздки живуть у памʼяті телефона: ввів код
 * один раз — і далі застосунок сам ділиться позицією, поки ви їдете.
 */

export interface GroupSettings {
  code: string
  name: string
  /** Постійний ідентифікатор цього телефона в групі */
  riderId: string
}

export interface Rider {
  id: string
  name: string
  lng: number
  lat: number
  speed: number | null
  heading: number | null
  /** Коли востаннє озвався */
  t: number
}

const KEY = 'motoapp.group'

export function loadGroup(): GroupSettings | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed?.code || !parsed?.riderId) return null
    return parsed as GroupSettings
  } catch {
    return null
  }
}

export function saveGroup(settings: GroupSettings) {
  localStorage.setItem(KEY, JSON.stringify(settings))
}

export function clearGroup() {
  localStorage.removeItem(KEY)
}

/** Код на кшталт «K7QM2F» — короткий, щоб продиктувати голосом. */
export function randomCode(): string {
  // Без літер, які плутаються на слух і на вигляд: O/0, I/1.
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let out = ''
  const values = crypto.getRandomValues(new Uint32Array(6))
  for (let i = 0; i < 6; i++) out += alphabet[values[i] % alphabet.length]
  return out
}

export function newRiderId(): string {
  return crypto.randomUUID()
}

/** «щойно», «2 хв тому» — наскільки свіжа позиція товариша. */
export function freshness(t: number): string {
  const sec = Math.round((Date.now() - t) / 1000)
  if (sec < 30) return 'щойно'
  if (sec < 90) return 'хвилину тому'
  return `${Math.round(sec / 60)} хв тому`
}
