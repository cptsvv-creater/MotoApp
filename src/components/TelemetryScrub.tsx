import { useMemo, useRef, useState } from 'react'
import type { Telemetry, TelemetrySample } from '../lib/telemetry'
import type { TrackPoint } from '../db'

/**
 * Телеметрія «як воно було»: зверху — справжня форма треку, знизу —
 * мотоцикл, який нахиляється так само, як нахилявся ти в цій точці.
 *
 * Ведеш пальцем по треку — силует хилиться, цифри змінюються, а на
 * карті вище рухається мітка. Так видно не «графік кутів», а конкретний
 * поворот: ось тут ти поклав байк на 34 градуси.
 */

const LEFT = '#3b93e0'
const RIGHT = '#e8631d'
const SPEED = '#2f9e7a'
const MAX_POINTS = 400

export function TelemetryScrub({
  telemetry,
  points,
  onCursor,
}: {
  telemetry: Telemetry
  points: TrackPoint[]
  /** Повідомляє карті, яку точку підсвітити */
  onCursor: (coords: [number, number] | null) => void
}) {
  const samples = useMemo(() => downsample(telemetry.samples, MAX_POINTS), [telemetry.samples])
  const [index, setIndex] = useState<number | null>(null)

  // Проєкція треку в плоскі координати: по довготі стискаємо на косинус
  // широти, інакше на наших широтах трек виходить розтягнутим удвічі.
  const shape = useMemo(() => projectTrack(samples, points), [samples, points])

  if (samples.length < 3 || !shape) return null

  const current = index != null ? samples[index] : null
  const lean = current?.lean ?? 0
  const speed = current?.speed ?? 0

  function pick(clientX: number, clientY: number, svg: SVGSVGElement | null) {
    if (!svg) return
    const box = svg.getBoundingClientRect()
    const px = ((clientX - box.left) / box.width) * shape!.width
    const py = ((clientY - box.top) / box.height) * shape!.height

    let best = 0
    let bestDist = Infinity
    for (let i = 0; i < shape!.xy.length; i++) {
      const [x, y] = shape!.xy[i]
      const d = (x - px) ** 2 + (y - py) ** 2
      if (d < bestDist) {
        bestDist = d
        best = i
      }
    }
    setIndex(best)
    const s = samples[best]
    const p = shape!.coords[best]
    if (p) onCursor([p[0], p[1]])
    return s
  }

  return (
    <div className="charts">
      <TrackShape shape={shape} index={index} onPick={pick} />

      <BikeGauge
        lean={lean}
        speed={speed}
        samples={samples}
        index={index}
        maxLeft={telemetry.maxLeanLeft}
        maxRight={telemetry.maxLeanRight}
      />

      <div className="chart-legend">
        <span>
          <i style={{ background: LEFT }} /> ліворуч
        </span>
        <span>
          <i style={{ background: RIGHT }} /> праворуч
        </span>
        <span className="muted">Веди пальцем по треку</span>
      </div>
    </div>
  )
}

/** Верхня плашка: справжня форма маршруту, по якій водиш пальцем. */
function TrackShape({
  shape,
  index,
  onPick,
}: {
  shape: Shape
  index: number | null
  onPick: (x: number, y: number, svg: SVGSVGElement | null) => void
}) {
  const ref = useRef<SVGSVGElement>(null)
  const here = index != null ? shape.xy[index] : null

  return (
    <div className="chart">
      <div className="chart-head">
        <span className="chart-title">Трек поїздки</span>
        <span className="chart-unit">{(shape.lengthKm).toFixed(1)} км</span>
      </div>
      <svg
        ref={ref}
        viewBox={`0 0 ${shape.width} ${shape.height}`}
        className="chart-svg track-shape"
        onPointerDown={(e) => onPick(e.clientX, e.clientY, ref.current)}
        onPointerMove={(e) => e.buttons > 0 && onPick(e.clientX, e.clientY, ref.current)}
      >
        {/* Пройдений шлях, пофарбований за нахилом: одразу видно, де
            були справжні повороти, а де пряма. */}
        {shape.segments.map((seg, i) => (
          <path
            key={i}
            d={seg.d}
            fill="none"
            stroke={seg.lean < -3 ? LEFT : seg.lean > 3 ? RIGHT : '#4a4a56'}
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
        {here && (
          <>
            <circle cx={here[0]} cy={here[1]} r={9} fill="#fff" fillOpacity={0.18} />
            <circle cx={here[0]} cy={here[1]} r={4.5} fill="#fff" />
          </>
        )}
      </svg>
    </div>
  )
}

/** Нижня плашка: силует мотоцикла спереду, який хилиться разом з тобою. */
function BikeGauge({
  lean,
  speed,
  samples,
  index,
  maxLeft,
  maxRight,
}: {
  lean: number
  speed: number
  samples: TelemetrySample[]
  index: number | null
  maxLeft: number
  maxRight: number
}) {
  const W = 320
  const H = 168
  const groundY = H - 30
  const maxSpeed = Math.max(...samples.map((s) => s.speed), 1)
  const total = samples[samples.length - 1].distance || 1

  // Крива швидкості — підкладка під силуетом.
  const speedPath = `M0 ${H} ${samples
    .map((s) => `L${((s.distance / total) * W).toFixed(1)} ${(H - (s.speed / maxSpeed) * 52).toFixed(1)}`)
    .join(' ')} L${W} ${H} Z`

  const leftValue = lean < -0.5 ? Math.abs(lean) : 0
  const rightValue = lean > 0.5 ? lean : 0

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg">
        <path d={speedPath} fill={SPEED} fillOpacity={0.14} />

        {index != null && (
          <line
            x1={(samples[index].distance / total) * W}
            x2={(samples[index].distance / total) * W}
            y1={0}
            y2={H}
            stroke="#8a8a96"
            strokeWidth={1}
          />
        )}

        {/* Кути по верхніх кутах: ліворуч — лівий нахил, праворуч — правий */}
        <text x={12} y={26} className="gauge-angle" fill={leftValue ? LEFT : '#4a4a56'}>
          {leftValue ? `${Math.round(leftValue)}°` : '—'}
        </text>
        <text x={W - 12} y={26} textAnchor="end" className="gauge-angle" fill={rightValue ? RIGHT : '#4a4a56'}>
          {rightValue ? `${Math.round(rightValue)}°` : '—'}
        </text>
        <text x={12} y={42} className="gauge-note" fill="#8a8a96">
          макс {Math.round(maxLeft)}°
        </text>
        <text x={W - 12} y={42} textAnchor="end" className="gauge-note" fill="#8a8a96">
          макс {Math.round(maxRight)}°
        </text>

        {/* Земля лишається горизонтальною, хилиться мотоцикл */}
        <line x1={W / 2 - 70} x2={W / 2 + 70} y1={groundY} y2={groundY} stroke="#3a3a44" strokeWidth={2} />
        <g
          transform={`rotate(${lean} ${W / 2} ${groundY}) translate(${W / 2} ${groundY}) scale(1.15) translate(${-W / 2} ${-groundY})`}
        >
          <Bike cx={W / 2} groundY={groundY} lean={lean} />
        </g>

        <text x={W / 2} y={H - 8} textAnchor="middle" className="gauge-speed" fill="#f2f2f5">
          {Math.round(speed)} км/год
        </text>
      </svg>
    </div>
  )
}

/**
 * Мотоцикл спереду. Впізнаваність тримається на трьох речах: широке
 * кермо з дзеркалами, кругла фара і вузьке колесо між перами вилки.
 */
function Bike({ cx, groundY, lean }: { cx: number; groundY: number; lean: number }) {
  const color = lean < -3 ? LEFT : lean > 3 ? RIGHT : '#c9c9d2'
  const wheelTop = groundY - 34
  const barY = groundY - 74
  return (
    <g stroke={color} fill="none" strokeLinecap="round">
      {/* колесо */}
      <rect x={cx - 3.5} y={wheelTop} width={7} height={34} rx={3.5} fill={color} stroke="none" />
      {/* пера вилки */}
      <line x1={cx - 8} y1={wheelTop + 4} x2={cx - 8} y2={barY + 10} strokeWidth={3} />
      <line x1={cx + 8} y1={wheelTop + 4} x2={cx + 8} y2={barY + 10} strokeWidth={3} />
      {/* фара */}
      <circle cx={cx} cy={barY + 14} r={10} fill={color} stroke="none" />
      {/* вітровик */}
      <path
        d={`M${cx - 11} ${barY - 2} Q${cx} ${barY - 20} ${cx + 11} ${barY - 2}`}
        strokeWidth={2.5}
      />
      {/* кермо з ручками */}
      <line x1={cx - 30} y1={barY} x2={cx + 30} y2={barY} strokeWidth={3.5} />
      {/* дзеркала */}
      <line x1={cx - 24} y1={barY} x2={cx - 30} y2={barY - 14} strokeWidth={2} />
      <line x1={cx + 24} y1={barY} x2={cx + 30} y2={barY - 14} strokeWidth={2} />
      <circle cx={cx - 31} cy={barY - 17} r={3.5} fill={color} stroke="none" />
      <circle cx={cx + 31} cy={barY - 17} r={3.5} fill={color} stroke="none" />
    </g>
  )
}

interface Shape {
  width: number
  height: number
  xy: [number, number][]
  coords: [number, number][]
  segments: { d: string; lean: number }[]
  lengthKm: number
}

function projectTrack(samples: TelemetrySample[], points: TrackPoint[]): Shape | null {
  if (samples.length < 3 || points.length < 3) return null

  // Кожній вибірці телеметрії шукаємо її точку треку за часом.
  const coords: [number, number][] = samples.map((s) => {
    let best = points[0]
    let bestDiff = Infinity
    for (const p of points) {
      const diff = Math.abs(p.t - s.t)
      if (diff < bestDiff) {
        bestDiff = diff
        best = p
      }
    }
    return [best.lng, best.lat]
  })

  const lats = coords.map((c) => c[1])
  const lngs = coords.map((c) => c[0])
  const midLat = (Math.min(...lats) + Math.max(...lats)) / 2
  const kx = Math.cos((midLat * Math.PI) / 180)

  const rawX = lngs.map((l) => l * kx)
  const rawY = lats.map((l) => -l)
  const spanX = Math.max(...rawX) - Math.min(...rawX) || 1e-6
  const spanY = Math.max(...rawY) - Math.min(...rawY) || 1e-6

  const width = 320
  const height = 150
  const pad = 14
  const scale = Math.min((width - pad * 2) / spanX, (height - pad * 2) / spanY)
  const offsetX = (width - spanX * scale) / 2
  const offsetY = (height - spanY * scale) / 2

  const xy: [number, number][] = rawX.map((x, i) => [
    offsetX + (x - Math.min(...rawX)) * scale,
    offsetY + (rawY[i] - Math.min(...rawY)) * scale,
  ])

  // Ріжемо на короткі відрізки, щоб кожен пофарбувати за своїм нахилом.
  const segments: { d: string; lean: number }[] = []
  const STEP = 4
  for (let i = 0; i < xy.length - 1; i += STEP) {
    const chunk = xy.slice(i, Math.min(i + STEP + 1, xy.length))
    if (chunk.length < 2) break
    const leanChunk = samples.slice(i, i + STEP + 1)
    const lean = leanChunk.reduce((sum, s) => sum + s.lean, 0) / leanChunk.length
    segments.push({
      d: chunk.map((p, j) => `${j === 0 ? 'M' : 'L'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' '),
      lean,
    })
  }

  return {
    width,
    height,
    xy,
    coords,
    segments,
    lengthKm: (samples[samples.length - 1].distance || 0) / 1000,
  }
}

function downsample(list: TelemetrySample[], limit: number): TelemetrySample[] {
  if (list.length <= limit) return list
  const step = list.length / limit
  const out: TelemetrySample[] = []
  for (let i = 0; i < limit; i++) out.push(list[Math.floor(i * step)])
  out.push(list[list.length - 1])
  return out
}
