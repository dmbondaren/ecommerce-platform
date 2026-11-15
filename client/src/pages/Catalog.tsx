import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { listingApi } from '../api/endpoints'
import { useAuth } from '../app/auth'
import { useDocumentTitle, useRequireLogin, useSavedListings } from '../app/hooks'
import { keys } from '../app/queryClient'
import { HomeAddressPrompt } from '../components/HomeAddress'
import { Icon } from '../components/Icon'
import { ListingGrid } from '../components/ListingCard'
import { Button, EmptyState, ErrorState, Pagination } from '../components/ui'

const SORTS = [
  ['newest', 'Newest first'],
  ['price_asc', 'Price: low to high'],
  ['price_desc', 'Price: high to low'],
  ['popular', 'Most viewed'],
  ['oldest', 'Oldest first'],
] as const

const CURRENCIES = ['CHF', 'EUR', 'USD', 'UAH']
const RADII = [1, 2, 5, 10, 20]

/**
 * "Near me": listings within a chosen distance of the user's home address.
 * Someone without an address is offered to add one, and may decline.
 */
function NearbyFilter({ radius, onChange }: { radius: string; onChange: (radius: string) => void }) {
  const { user } = useAuth()
  const requireLogin = useRequireLogin()
  const [asking, setAsking] = useState(false)
  const active = radius !== ''
  const hasHome = Boolean(user?.homeCoordinates)

  return (
    <div className="nearby">
      <button
        type="button"
        className={active ? 'nearby-btn active' : 'nearby-btn'}
        title={hasHome ? `Searching around ${user?.homeAddress || 'your address'}. Click to change it.` : undefined}
        // With an address on file the button opens it for editing; without one it offers to add it.
        onClick={() => requireLogin(() => setAsking(true))}
      >
        <Icon name="pin" size={18} />
        {active ? `Within ${radius} km` : 'Near me'}
      </button>
      {hasHome && (
        <div className="chips nearby-options" role="group" aria-label="Distance from your address">
          {RADII.map((km) => (
            <button
              key={km}
              type="button"
              className={radius === String(km) ? 'chip active' : 'chip'}
              aria-pressed={radius === String(km)}
              onClick={() => onChange(String(km))}
            >
              {km} km
            </button>
          ))}
          {active && (
            <button type="button" className="chip" onClick={() => onChange('')}>
              Everywhere
            </button>
          )}
        </div>
      )}
      {asking && (
        <HomeAddressPrompt
          onClose={() => setAsking(false)}
          onSaved={() => {
            setAsking(false)
            // Keeps the chosen distance when only the address changed.
            if (!active) onChange('5')
          }}
        />
      )}
    </div>
  )
}

function PriceFilter({ min, max, onApply }: { min: string; max: string; onApply: (min: string, max: string) => void }) {
  const [draft, setDraft] = useState({ min, max })
  const submit = (event: FormEvent) => {
    event.preventDefault()
    onApply(draft.min, draft.max)
  }
  return (
    <form className="price-filter" onSubmit={submit}>
      <input
        type="number"
        min={0}
        inputMode="decimal"
        placeholder="Min"
        aria-label="Minimum price"
        value={draft.min}
        onChange={(event) => setDraft({ ...draft, min: event.target.value })}
      />
      <span aria-hidden="true">–</span>
      <input
        type="number"
        min={0}
        inputMode="decimal"
        placeholder="Max"
        aria-label="Maximum price"
        value={draft.max}
        onChange={(event) => setDraft({ ...draft, max: event.target.value })}
      />
      <Button type="submit" size="sm">
        Apply
      </Button>
    </form>
  )
}

/** The filters live in the URL, so a search can be shared, bookmarked and navigated with the back button. */
export function Catalog() {
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const filters = {
    q: params.get('q') ?? '',
    category: params.get('category') ?? '',
    minPrice: params.get('minPrice') ?? '',
    maxPrice: params.get('maxPrice') ?? '',
    currency: params.get('currency') ?? '',
    radius: params.get('radius') ?? '',
    sort: params.get('sort') ?? 'newest',
    page: Math.max(1, Number(params.get('page')) || 1),
  }
  useDocumentTitle(filters.q || undefined)

  const update = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params)
    // Any change of the filters starts again from the first page.
    if (!('page' in patch)) next.delete('page')
    for (const [key, value] of Object.entries(patch)) {
      if (value && value !== (key === 'sort' ? 'newest' : key === 'page' ? '1' : '')) next.set(key, value)
      else next.delete(key)
    }
    setParams(next)
  }

  const categories = useQuery({ queryKey: keys.categories, queryFn: listingApi.categories, staleTime: Infinity })
  const results = useQuery({
    queryKey: [...keys.listings, 'search', filters, user?.homeCoordinates ?? null],
    queryFn: () => {
      const { radius, ...rest } = filters
      // The distance filter needs a home address; a shared link opened by someone without one shows everything.
      return listingApi.search({ ...rest, radiusKm: radius && user?.homeCoordinates ? Number(radius) : undefined })
    },
    placeholderData: keepPreviousData,
  })
  const saved = useSavedListings()
  const hasFilters = Boolean(filters.q || filters.category || filters.minPrice || filters.maxPrice || filters.currency || filters.radius)

  return (
    <>
      <section className="hero">
        <h1>{filters.q ? `Results for “${filters.q}”` : 'Find it second-hand, close to home'}</h1>
        <NearbyFilter radius={user?.homeCoordinates ? filters.radius : ''} onChange={(radius) => update({ radius })} />
      </section>

      <div className="chips" role="group" aria-label="Category">
        <button
          type="button"
          className={filters.category ? 'chip' : 'chip active'}
          aria-pressed={!filters.category}
          onClick={() => update({ category: '' })}
        >
          All
        </button>
        {categories.data?.map((category) => (
          <button
            key={category.id}
            type="button"
            className={filters.category === category.slug ? 'chip active' : 'chip'}
            aria-pressed={filters.category === category.slug}
            onClick={() => update({ category: category.slug })}
          >
            {category.name}
          </button>
        ))}
      </div>

      <div className="toolbar">
        <PriceFilter
          key={`${filters.minPrice}-${filters.maxPrice}`}
          min={filters.minPrice}
          max={filters.maxPrice}
          onApply={(minPrice, maxPrice) => update({ minPrice, maxPrice })}
        />
        <select
          aria-label="Currency"
          value={filters.currency}
          onChange={(event) => update({ currency: event.target.value })}
        >
          <option value="">Any currency</option>
          {CURRENCIES.map((currency) => (
            <option key={currency}>{currency}</option>
          ))}
        </select>
        <div className="toolbar-end">
          {results.data && (
            <span className="muted" aria-live="polite">
              {results.data.total} {results.data.total === 1 ? 'listing' : 'listings'}
            </span>
          )}
          <select aria-label="Sort by" value={filters.sort} onChange={(event) => update({ sort: event.target.value })}>
            {SORTS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {results.data === undefined ? (
        results.isPending ? (
          <div className="grid" aria-busy="true">
            {Array.from({ length: 8 }, (_, index) => (
              <div key={index} className="card skeleton" />
            ))}
          </div>
        ) : (
          <ErrorState error={results.error} onRetry={() => void results.refetch()} />
        )
      ) : results.data.items.length === 0 ? (
        <EmptyState title="Nothing matches yet">
          {hasFilters ? (
            <Button onClick={() => setParams({})}>Clear all filters</Button>
          ) : (
            <p>Be the first to list something.</p>
          )}
        </EmptyState>
      ) : (
        <div className={results.isPlaceholderData ? 'faded' : undefined}>
          <ListingGrid
            listings={results.data.items}
            favoriteIds={saved.favoriteIds}
            onToggleFavorite={saved.toggleFavorite}
          />
          <Pagination
            page={results.data.page}
            totalPages={results.data.totalPages}
            onChange={(page) => {
              update({ page: String(page) })
              window.scrollTo({ top: 0 })
            }}
          />
        </div>
      )}
    </>
  )
}
