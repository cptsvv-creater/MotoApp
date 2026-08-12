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

const db = new Dexie('motoapp') as Dexie & {
  rides: EntityTable<Ride, 'id'>
  points: EntityTable<TrackPoint, 'id'>
}

db.version(1).stores({
  rides: '++id, startedAt, endedAt',
  points: '++id, rideId, t',
})

export { db }

export async function deleteRide(rideId: number) {
  await db.transaction('rw', db.rides, db.points, async () => {
    await db.points.where('rideId').equals(rideId).delete()
    await db.rides.delete(rideId)
  })
}
