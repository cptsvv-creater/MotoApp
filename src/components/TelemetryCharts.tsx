import { useMemo, useRef, useState } from 'react'
import type { Telemetry, TelemetrySample } from '../lib/telemetry'

/**
 * Два окремі графіки: швидкість і нахил. Саме окремі — суміщати дві різні
 * величини на спільних осях означає малювати перетини, яких не існує.
 *
 * Нахил має полярність (ліворуч/праворуч), тому кольори розходяться від
 * нейтрального нуля: синій ліворуч, помаранчевий праворуч.
 */

const W = 320
const H = 96
const PAD = 8
const SPEED = '#2f9e7a'
const LEFT = '#3b93e0'
const RIGHT = '#e8631d'
/** Більше точок екран все одно не покаже, а малювати їх дорого. */
const MAX_POINTS = 240

export function TelemetryCharts({ telemetry }: { telemetry: Telemetry }) {
  const samples = useMemo(() => downsample(telemetry.samples, MAX_POINTS), [telemetry.samples])
  const [cursor, setCursor] = useState<number | null>(null)

  if (samples.length < 3) return null

  const totalDistance = samples[samples.length - 1].distance || 1
  const maxSpeed = Math.max(...samples.map((s) => s.speed), 1)
  const leanBound = Math.max(10, ...samples.map((s) => Math.abs(s.lean)))
  const active = cursor != null ? samples[cursor] : null

  const x = (s: TelemetrySample) => PAD + (s.distance / totalDistance) * (W - PAD * 2)

  return (
    <div className="charts">
      <Chart
        title="Швидкість"
        unit="км/год"
        value={active ? Math.round(active.speed) : Math.round(maxSpeed)}
        caption={active ? `на ${(active.distance / 1000).toFixed(1)} км` : 'максимум за поїздку'}
        samples={samples}
        x={x}
        cursor={cursor}
        onCursor={setCursor}
      >
        <path
          d={line(samples, x, (s) => H - PAD - (s.speed / maxSpeed) * (H - PAD * 2))}
          fill="none"
          stroke={SPEED}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </Chart>

      <Chart
        title="Нахил"
        unit="°"
        value={active ? Math.round(Math.abs(active.lean)) : Math.round(telemetry.maxLeanRight)}
        caption={
          active
            ? active.lean < -1
              ? 'ліворуч'
              : active.lean > 1
                ? 'праворуч'
                : 'рівно'
            : 'найбільший праворуч'
        }
        samples={samples}
        x={x}
        cursor={cursor}
        onCursor={setCursor}
      >
        {/* Нуль — нейтральна вісь, від неї розходяться два боки */}
        <line x1={PAD} x2={W - PAD} y1={H / 2} y2={H / 2} stroke="#3a3a44" strokeWidth={1} />
        <path
          d={area(samples, x, (s) => H / 2 - (Math.max(s.lean, 0) / leanBound) * (H / 2 - PAD), H / 2)}
          fill={RIGHT}
          fillOpacity={0.55}
        />
        <path
          d={area(samples, x, (s) => H / 2 - (Math.min(s.lean, 0) / leanBound) * (H / 2 - PAD), H / 2)}
          fill={LEFT}
          fillOpacity={0.55}
        />
      </Chart>

      <div className="chart-legend">
        <span>
          <i style={{ background: LEFT }} /> ліворуч
        </span>
        <span>
          <i style={{ background: RIGHT }} /> праворуч
        </span>
        <span className="muted">Веди пальцем по графіку</span>
      </div>
    </div>
  )
}

function Chart({
  title,
  unit,
  value,
  caption,
  samples,
  x,
  cursor,
  onCursor,
  children,
}: {
  title: string
  unit: string
  value: number
  caption: string
  samples: TelemetrySample[]
  x: (s: TelemetrySample) => number
  cursor: number | null
  onCursor: (i: number | null) => void
  children: React.ReactNode
}) {
  const ref = useRef<SVGSVGElement>(null)

  function pick(clientX: number) {
    const box = ref.current?.getBoundingClientRect()
    if (!box) return
    const ratio = (clientX - box.left) / box.width
    const i = Math.round(ratio * (samples.length - 1))
    onCursor(Math.min(samples.length - 1, Math.max(0, i)))
  }

  return (
    <div className="chart">
      <div className="chart-head">
        <span className="chart-title">{title}</span>
        <span className="chart-value">
          {value}
          <span className="chart-unit"> {unit}</span>
        </span>
      </div>
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        className="chart-svg"
        onPointerDown={(e) => pick(e.clientX)}
        onPointerMove={(e) => e.buttons > 0 && pick(e.clientX)}
        onPointerLeave={() => onCursor(null)}
        onPointerUp={() => onCursor(null)}
      >
        {children}
        {cursor != null && (
          <line
            x1={x(samples[cursor])}
            x2={x(samples[cursor])}
            y1={0}
            y2={H}
            stroke="#8a8a96"
            strokeWidth={1}
          />
        )}
      </svg>
      <div className="chart-caption muted">{caption}</div>
    </div>
  )
}

function line(
  samples: TelemetrySample[],
  x: (s: TelemetrySample) => number,
  y: (s: TelemetrySample) => number,
): string {
  return samples.map((s, i) => `${i === 0 ? 'M' : 'L'}${x(s).toFixed(1)} ${y(s).toFixed(1)}`).join(' ')
}

function area(
  samples: TelemetrySample[],
  x: (s: TelemetrySample) => number,
  y: (s: TelemetrySample) => number,
  base: number,
): string {
  if (samples.length === 0) return ''
  return `${line(samples, x, y)} L${x(samples[samples.length - 1]).toFixed(1)} ${base} L${x(samples[0]).toFixed(1)} ${base} Z`
}

/** Рівномірно проріджуємо, зберігаючи першу й останню точки. */
function downsample(list: TelemetrySample[], limit: number): TelemetrySample[] {
  if (list.length <= limit) return list
  const step = list.length / limit
  const out: TelemetrySample[] = []
  for (let i = 0; i < limit; i++) out.push(list[Math.floor(i * step)])
  out.push(list[list.length - 1])
  return out
}
