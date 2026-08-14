import Dexie, { type EntityTable } from 'dexie'

/** Одна GPS-точка треку. */
export interface TrackPoint {
  id?: number
  rideId: number
  t: number // timestamp, мс
  lat: number
  lng: number
  /** метри над рівнем моря, якщо телефон дав */
  alt: number | null
  /** м/с, з GPS */
  speed: number | null
  /** курс у градусах */
  heading: number | null
  /** точність позиції в метрах */
  acc: number | null
}

/** Поїздка. */
export interface Ride {
  id?: number
  startedAt: number
  endedAt: number | null
  /** метри */
  distance: number
  /** мс у русі (без урахування пауз/стоянок) */
  movingTime: number
  /** м/с */
  maxSpeed: number
  /** метри набору висоти */
  ascent: number
  title: string
  notes: string
}

/** Мотоцикл у гаражі. */
export interface Bike {
  id?: number
  name: string
  model: string
  /** Пробіг на одометрі байка на момент baseAt, у кілометрах. */
  baseOdo: number
  /** Коли записали baseOdo. Поїздки після цієї миті додаються до пробігу. */
  baseAt: number
  createdAt: number
}

/** Пункт обслуговування: що і як часто міняти. */
export interface ServiceItem {
  id?: number
  bikeId: number
  title: string
  /** Інтервал у кілометрах, якщо є */
  intervalKm: number | null
  /** Інтервал у днях, якщо є */
  intervalDays: number | null
  /** Пробіг байка, коли робили востаннє */
  lastDoneOdo: number
  /** Коли робили востаннє */
  lastDoneAt: number
}

/** Запис у журналі виконаних робіт. */
export interface ServiceLog {
  id?: number
  bikeId: number
  itemId: number | null
  title: string
  odo: number
  at: number
  cost: number
  notes: string
}

/** Своє місце: дім, гараж, дача. Звідси беруться кнопка «Додому» і
 *  впевнене визначення «приїхав». */
export interface Place {
  id?: number
  name: string
  lng: number
  lat: number
  /** Дім може бути лише один — саме він потрапляє на швидку кнопку. */
  isHome: boolean
  createdAt: number
}

const db = new Dexie('motoapp') as Dexie & {
  rides: EntityTable<Ride, 'id'>
  points: EntityTable<TrackPoint, 'id'>
  bikes: EntityTable<Bike, 'id'>
  serviceItems: EntityTable<ServiceItem, 'id'>
  serviceLog: EntityTable<ServiceLog, 'id'>
  places: EntityTable<Place, 'id'>
}

db.version(1).stores({
  rides: '++id, startedAt, endedAt',
  points: '++id, rideId, t',
})

db.version(2).stores({
  rides: '++id, startedAt, endedAt',
  points: '++id, rideId, t',
  bikes: '++id, createdAt',
  serviceItems: '++id, bikeId',
  serviceLog: '++id, bikeId, at',
})

db.version(3).stores({
  rides: '++id, startedAt, endedAt',
  points: '++id, rideId, t',
  bikes: '++id, createdAt',
  serviceItems: '++id, bikeId',
  serviceLog: '++id, bikeId, at',
  places: '++id, createdAt, isHome',
})

export { db }

/** Дім лише один: призначаючи новий, знімаємо позначку зі старого. */
export async function savePlace(place: Omit<Place, 'id' | 'createdAt'>) {
  await db.transaction('rw', db.places, async () => {
    if (place.isHome) {
      const previous = await db.places.filter((p) => p.isHome).toArray()
      await Promise.all(previous.map((p) => db.places.update(p.id!, { isHome: false })))
    }
    await db.places.add({ ...place, createdAt: Date.now() })
  })
}

export async function deleteBike(bikeId: number) {
  await db.transaction('rw', db.bikes, db.serviceItems, db.serviceLog, async () => {
    await db.serviceItems.where('bikeId').equals(bikeId).delete()
    await db.serviceLog.where('bikeId').equals(bikeId).delete()
    await db.bikes.delete(bikeId)
  })
}

export async function deleteRide(rideId: number) {
  await db.transaction('rw', db.rides, db.points, async () => {
    await db.points.where('rideId').equals(rideId).delete()
    await db.rides.delete(rideId)
  })
}
