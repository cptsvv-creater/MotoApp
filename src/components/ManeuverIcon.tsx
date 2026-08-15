/**
 * Дорожні піктограми маневрів. Не текстові стрілки, а намальована
 * дорога з поворотом: товсті лінії, заокруглені кінці й тінь — щоб
 * читалося боковим зором за півсекунди, не вдивляючись.
 *
 * Малюємо тільки праві варіанти, ліві — те саме дзеркально.
 */

interface Shape {
  /** Основна лінія дороги */
  road: string
  /** Куди дивиться вістря і як його повернути */
  head: { x: number; y: number; angle: number }
  /** Другорядна гілка — для розʼїздів, малюється тьмяно */
  branch?: string
  /** Кільце — для кругових розвʼязок */
  circle?: { cx: number; cy: number; r: number }
}

const STRAIGHT: Shape = { road: 'M24 44 V18', head: { x: 24, y: 18, angle: 0 } }

const SHAPES: Record<number, Shape> = {
  // прямо / початок маршруту
  6: STRAIGHT,
  11: STRAIGHT,
  // поворот праворуч
  1: { road: 'M24 44 V28 Q24 20 32 20 H36', head: { x: 40, y: 20, angle: 90 } },
  // плавно праворуч
  5: { road: 'M24 44 V30 L33 19', head: { x: 36, y: 16, angle: 40 } },
  // різкий поворот праворуч: вістря відсунуте, щоб не злипалось із дугою
  3: { road: 'M24 44 V27 Q24 18 32 20 L34 22', head: { x: 38, y: 27, angle: 140 } },
  // тримайся правіше: розʼїзд із двох гілок, обрана — товста
  13: {
    road: 'M24 44 V33 Q25 24 32 18',
    branch: 'M24 34 Q22 25 15 19',
    head: { x: 35, y: 15, angle: 40 },
  },
  // розворот
  9: { road: 'M16 44 V25 Q16 15 25 15 Q34 15 34 25 V29', head: { x: 34, y: 34, angle: 180 } },
  // виїзд на кільце: зʼїзд праворуч, вістря винесене за коло
  7: {
    road: 'M24 44 V34',
    circle: { cx: 22, cy: 22, r: 8 },
    branch: 'M30 22 H36',
    head: { x: 44, y: 22, angle: 90 },
  },
  // зʼїзд з кільця: вихід угору
  8: {
    road: 'M24 44 V34',
    circle: { cx: 24, cy: 26, r: 8 },
    branch: 'M24 18 V14',
    head: { x: 24, y: 5, angle: 0 },
  },
}

/** Ліві маневри — дзеркальні до правих. */
const MIRRORED: Record<number, number> = { 0: 1, 2: 3, 4: 5, 12: 13 }

export function ManeuverIcon({ type, size = 46 }: { type: number; size?: number }) {
  // Прибуття малюємо окремо: це не поворот, а прапорець.
  if (type === 10) {
    return (
      <svg viewBox="0 0 48 48" width={size} height={size} className="maneuver-icon">
        <path d="M16 44 V8" stroke="currentColor" strokeWidth={5} strokeLinecap="round" fill="none" />
        <path d="M16 10 L38 16 L16 22 Z" fill="currentColor" />
      </svg>
    )
  }

  const mirrored = MIRRORED[type]
  const shape = SHAPES[mirrored ?? type] ?? STRAIGHT

  return (
    <svg viewBox="0 0 48 48" width={size} height={size} className="maneuver-icon">
      {/* Дзеркалимо всю групу, а не кожен шлях окремо. */}
      <g transform={mirrored != null ? 'translate(48 0) scale(-1 1)' : undefined}>
        {shape.branch && (
          <path
            d={shape.branch}
            stroke="currentColor"
            strokeWidth={4}
            strokeLinecap="round"
            fill="none"
            opacity={0.45}
          />
        )}
        {shape.circle && (
          <circle
            cx={shape.circle.cx}
            cy={shape.circle.cy}
            r={shape.circle.r}
            stroke="currentColor"
            strokeWidth={4.5}
            fill="none"
            opacity={0.55}
          />
        )}
        <path
          d={shape.road}
          stroke="currentColor"
          strokeWidth={6}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <path
          d="M0 0 L-8 10 L8 10 Z"
          fill="currentColor"
          transform={`translate(${shape.head.x} ${shape.head.y}) rotate(${shape.head.angle})`}
        />
      </g>
    </svg>
  )
}
