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

const db = new Dexie('motoapp') as Dexie & {
  rides: EntityTable<Ride, 'id'>
  points: EntityTable<TrackPoint, 'id'>
  bikes: EntityTable<Bike, 'id'>
  serviceItems: EntityTable<ServiceItem, 'id'>
  serviceLog: EntityTable<ServiceLog, 'id'>
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

export { db }

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
