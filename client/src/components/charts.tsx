import { formatDate } from '../lib/format'

interface TrendPoint {
  /** ISO date of the point. */
  date: string
  value: number
}

const WIDTH = 320
const HEIGHT = 120
const PAD = { top: 10, right: 6, bottom: 6, left: 6 }

/**
 * One measure over time: a single line on its own axis, with the peak named
 * above and the period below. Every point has a tooltip; hovering a column
 * anywhere along its height finds it.
 */
export function TrendChart({ points, format = String }: { points: TrendPoint[]; format?: (value: number) => string }) {
  const peak = Math.max(1, ...points.map((point) => point.value))
  const innerWidth = WIDTH - PAD.left - PAD.right
  const innerHeight = HEIGHT - PAD.top - PAD.bottom
  const step = points.length > 1 ? innerWidth / (points.length - 1) : 0
  const placed = points.map((point, index) => ({
    ...point,
    x: PAD.left + (points.length > 1 ? index * step : innerWidth / 2),
    y: PAD.top + innerHeight - (point.value / peak) * innerHeight,
  }))
  const line = placed.map((point) => `${point.x},${point.y}`).join(' ')
  const first = points[0]
  const last = points[points.length - 1]

  return (
    <figure className="trend">
      <figcaption className="chart-scale">{format(peak)}</figcaption>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Trend over the period">
        {[0, 0.5, 1].map((level) => (
          <line
            key={level}
            className="chart-grid"
            x1={PAD.left}
            x2={WIDTH - PAD.right}
            y1={PAD.top + innerHeight * level}
            y2={PAD.top + innerHeight * level}
          />
        ))}
        {placed.length > 1 && (
          <>
            <polygon
              className="chart-area"
              points={`${PAD.left},${PAD.top + innerHeight} ${line} ${WIDTH - PAD.right},${PAD.top + innerHeight}`}
            />
            <polyline className="chart-line" points={line} />
          </>
        )}
        {placed.map((point) => (
          <g key={point.date} className="chart-column">
            {point.value > 0 && <circle className="chart-dot" cx={point.x} cy={point.y} r={3.5} />}
            <rect className="chart-hit" x={point.x - Math.max(step, 8) / 2} y={0} width={Math.max(step, 8)} height={HEIGHT}>
              <title>{`${formatDate(point.date)}: ${format(point.value)}`}</title>
            </rect>
          </g>
        ))}
      </svg>
      {first && last && (
        <p className="chart-range">
          <span>{formatDate(first.date)}</span>
          <span>{formatDate(last.date)}</span>
        </p>
      )}
    </figure>
  )
}

interface BarRow {
  label: string
  value: number
  /** Shown after the value, e.g. the revenue behind a count. */
  note?: string
}

/** Ranked horizontal bars in one colour: the bar length is the comparison, the number is the fact. */
export function BarList({ rows }: { rows: BarRow[] }) {
  const peak = Math.max(1, ...rows.map((row) => row.value))
  return (
    <ul className="bar-list">
      {rows.map((row) => (
        <li key={row.label}>
          <span className="bar-label">{row.label}</span>
          <span className="bar-track">
            <span className="bar-fill" style={{ width: `${(row.value / peak) * 100}%` }} />
          </span>
          <strong>{row.value}</strong>
          {row.note && <span className="muted">{row.note}</span>}
        </li>
      ))}
    </ul>
  )
}
