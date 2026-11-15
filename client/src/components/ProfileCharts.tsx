import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { userApi } from '../api/endpoints'
import type { CategoryCount, Deal } from '../api/types'
import { t } from '../app/i18n'
import { formatDate, formatPrice } from '../lib/format'
import { Modal } from './ui'

const MAX_SLICES = 5

/** Keeps the largest categories and folds the rest into "Other", so colours are never recycled. */
export function topSlices(counts: CategoryCount[], max = MAX_SLICES): CategoryCount[] {
  if (counts.length <= max + 1) return counts
  const rest = counts.slice(max).reduce((sum, item) => sum + item.count, 0)
  return [...counts.slice(0, max), { name: 'Other', count: rest }]
}

/** The currency most deals were made in; amounts in different currencies cannot share an axis. */
export function mainCurrency(deals: Deal[]): string | null {
  const counts = new Map<string, number>()
  for (const deal of deals) counts.set(deal.currency, (counts.get(deal.currency) ?? 0) + 1)
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
}

const WIDTH = 320
const HEIGHT = 150
const PAD = { top: 14, right: 12, bottom: 8, left: 12 }

/** Deal amounts over time: one line, a dot per deal, each dot with its own tooltip. */
function DealsChart({ deals, currency }: { deals: Deal[]; currency: string }) {
  const peak = Math.max(1, ...deals.map((deal) => deal.price))
  const innerWidth = WIDTH - PAD.left - PAD.right
  const innerHeight = HEIGHT - PAD.top - PAD.bottom
  const points = deals.map((deal, index) => ({
    deal,
    x: PAD.left + (deals.length === 1 ? innerWidth / 2 : (index / (deals.length - 1)) * innerWidth),
    y: PAD.top + innerHeight - (deal.price / peak) * innerHeight,
  }))
  const first = deals[0]
  const last = deals[deals.length - 1]

  return (
    <figure className="deal-chart">
      <figcaption className="chart-scale">{formatPrice(peak, currency)}</figcaption>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={t('Amount of each deal over time')}>
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
        {points.length > 1 && (
          <polyline className="chart-line" points={points.map((point) => `${point.x},${point.y}`).join(' ')} />
        )}
        {points.map((point, index) => (
          <g key={index}>
            <circle className="chart-dot" cx={point.x} cy={point.y} r={5} />
            {/* A larger invisible target, so the tooltip is easy to reach. */}
            <circle className="chart-hit" cx={point.x} cy={point.y} r={14}>
              <title>
                {`${point.deal.title}: ${formatPrice(point.deal.price, point.deal.currency)}, ${formatDate(point.deal.date)}`}
              </title>
            </circle>
          </g>
        ))}
      </svg>
      {first && last && (
        <p className="chart-range">
          <span>{formatDate(first.date)}</span>
          {deals.length > 1 && <span>{formatDate(last.date)}</span>}
        </p>
      )}
    </figure>
  )
}

/** The item exactly as it was sold: the order keeps its own copy of the listing. */
function DealDialog({ deal, onClose }: { deal: Deal; onClose: () => void }) {
  return (
    <Modal title={deal.title} onClose={onClose}>
      <div className="modal-body">
        {deal.imageUrls.length > 0 && (
          <div className="order-photos">
            {deal.imageUrls.map((url) => (
              <a key={url} href={url} target="_blank" rel="noreferrer">
                <img src={url} alt="" loading="lazy" />
              </a>
            ))}
          </div>
        )}
        <p className="price">{formatPrice(deal.price, deal.currency)}</p>
        <p className="muted">
          {t(deal.category)} · {formatDate(deal.date)}
        </p>
        <p className="prose">{deal.description}</p>
      </div>
      {deal.listingId && (
        <footer className="modal-footer">
          <Link className="btn btn-secondary btn-md" to={`/listings/${deal.listingId}`}>
            {t('Open the listing')}
          </Link>
        </footer>
      )}
    </Modal>
  )
}

function DealRows({ deals, onOpen }: { deals: Deal[]; onOpen: (deal: Deal) => void }) {
  return (
    <ul className="deal-list">
      {deals.map((deal) => (
        <li key={deal.id}>
          <button type="button" onClick={() => onOpen(deal)}>
            <span>
              <strong>{deal.title}</strong>
              <span className="muted">{formatDate(deal.date)}</span>
            </span>
            <strong>{formatPrice(deal.price, deal.currency)}</strong>
          </button>
        </li>
      ))}
    </ul>
  )
}

function DealsCard({ title, deals, onOpen }: { title: string; deals: Deal[]; onOpen: (deal: Deal) => void }) {
  const currency = mainCurrency(deals)
  const charted = deals.filter((deal) => deal.currency === currency)
  return (
    <section className="card stat-card">
      <header>
        <h3>{title}</h3>
        <span className="badge">{deals.length}</span>
      </header>
      {currency === null ? (
        <p className="muted">{t('Nothing yet')}</p>
      ) : (
        <>
          <DealsChart deals={charted} currency={currency} />
          <DealRows deals={deals.slice(-4).reverse()} onOpen={onOpen} />
        </>
      )}
    </section>
  )
}

const RADIUS = 42
const CIRCUMFERENCE = 2 * Math.PI * RADIUS
/** Gap between neighbouring slices, in the same units as the circumference. */
const GAP = 2.5

/** Share of each category. The legend carries names and counts, so colour is never the only cue. */
function CategoryCard({
  title,
  counts,
  onSelect,
}: {
  title: string
  counts: CategoryCount[]
  onSelect: (category: string) => void
}) {
  const slices = topSlices(counts)
  const total = slices.reduce((sum, slice) => sum + slice.count, 0)
  let offset = 0

  return (
    <section className="card stat-card">
      <header>
        <h3>{title}</h3>
      </header>
      {total === 0 ? (
        <p className="muted">{t('Nothing yet')}</p>
      ) : (
        <div className="donut">
          <svg viewBox="0 0 120 120" role="img" aria-label={title}>
            <g transform="rotate(-90 60 60)">
              {slices.map((slice, index) => {
                const length = (slice.count / total) * CIRCUMFERENCE
                const visible = Math.max(0.5, length - (slices.length > 1 ? GAP : 0))
                const dash = `${visible} ${CIRCUMFERENCE - visible}`
                const start = offset
                offset += length
                return (
                  <circle
                    key={slice.name}
                    className={`series-${index + 1}`}
                    cx={60}
                    cy={60}
                    r={RADIUS}
                    fill="none"
                    strokeWidth={16}
                    strokeDasharray={dash}
                    strokeDashoffset={-start}
                    onClick={slice.name === 'Other' ? undefined : () => onSelect(slice.name)}
                  >
                    <title>{`${t(slice.name)}: ${slice.count}`}</title>
                  </circle>
                )
              })}
            </g>
            <text x={60} y={60} className="donut-total" textAnchor="middle" dominantBaseline="central">
              {total}
            </text>
          </svg>
          <ul className="legend">
            {slices.map((slice, index) => (
              <li key={slice.name}>
                {/* "Other" stands for several categories, so there is no single list behind it. */}
                <button type="button" disabled={slice.name === 'Other'} onClick={() => onSelect(slice.name)}>
                  <span className={`swatch series-${index + 1}`} aria-hidden="true" />
                  <span>{t(slice.name)}</span>
                  <strong>{slice.count}</strong>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

interface Props {
  userId: string
  /** Called when a category of the user's current listings is picked. */
  onListingCategory: (category: string) => void
}

/**
 * The statistics block of a public profile: what the user sold and bought,
 * and in which categories. Everything leads somewhere: a deal opens the item
 * as it was sold, a category opens the items behind it.
 */
export function ProfileCharts({ userId, onListingCategory }: Props) {
  const query = useQuery({ queryKey: ['users', userId, 'activity'], queryFn: () => userApi.activity(userId) })
  const [deal, setDeal] = useState<Deal | null>(null)
  const [group, setGroup] = useState<{ title: string; deals: Deal[] } | null>(null)
  const activity = query.data
  if (!activity) return null

  const openGroup = (title: string, deals: Deal[]) => (category: string) =>
    setGroup({ title: `${title}: ${t(category)}`, deals: deals.filter((item) => item.category === category).reverse() })

  return (
    <div className="stat-grid">
      <DealsCard title={t('Sales over time')} deals={activity.sales} onOpen={setDeal} />
      <DealsCard title={t('Purchases over time')} deals={activity.purchases} onOpen={setDeal} />
      <CategoryCard title={t('Listing categories')} counts={activity.listingCategories} onSelect={onListingCategory} />
      <CategoryCard
        title={t('Sales by category')}
        counts={activity.saleCategories}
        onSelect={openGroup(t('Sold'), activity.sales)}
      />
      <CategoryCard
        title={t('Purchases by category')}
        counts={activity.purchaseCategories}
        onSelect={openGroup(t('Bought'), activity.purchases)}
      />
      {group && !deal && (
        <Modal title={group.title} onClose={() => setGroup(null)}>
          <div className="modal-body">
            <DealRows deals={group.deals} onOpen={setDeal} />
          </div>
        </Modal>
      )}
      {deal && <DealDialog deal={deal} onClose={() => setDeal(null)} />}
    </div>
  )
}
