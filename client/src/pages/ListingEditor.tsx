import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { listingApi } from '../api/endpoints'
import type { Coordinates, Currency, Listing, ListingInput } from '../api/types'
import { useAuth } from '../app/auth'
import { useDocumentTitle } from '../app/hooks'
import { keys } from '../app/queryClient'
import { toast } from '../app/toast'
import { ImagePicker } from '../components/ImagePicker'
import { LocationPicker } from '../components/LocationPicker'
import { Button, EmptyState, Field, FormError, PageHeader, QueryView, fieldErrors } from '../components/ui'

const CURRENCIES: Currency[] = ['CHF', 'EUR', 'USD', 'UAH']

interface FormState {
  title: string
  description: string
  price: string
  currency: Currency
  categoryId: string
  location: string
  phone: string
  imageUrls: string[]
  coordinates: Coordinates | null
}

function EditorForm({ listing }: { listing?: Listing }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const client = useQueryClient()
  const categories = useQuery({ queryKey: keys.categories, queryFn: listingApi.categories, staleTime: Infinity })
  const [form, setForm] = useState<FormState>({
    title: listing?.title ?? '',
    description: listing?.description ?? '',
    price: listing ? String(listing.price) : '',
    currency: listing?.currency ?? user?.preferredCurrency ?? 'CHF',
    categoryId: listing ? String(listing.category.id) : '',
    location: listing?.location ?? '',
    phone: listing?.phone ?? user?.phone ?? '',
    imageUrls: listing?.imageUrls ?? [],
    coordinates: listing?.coordinates ?? null,
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const errors = fieldErrors(error)
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value }))

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const input: ListingInput = { ...form, price: Number(form.price), categoryId: Number(form.categoryId) }
    try {
      const saved = listing ? await listingApi.update(listing.id, input) : await listingApi.create(input)
      await client.invalidateQueries({ queryKey: keys.listings })
      toast.success(listing ? 'Changes saved' : 'Your listing is live')
      navigate(`/listings/${saved.id}`)
    } catch (err) {
      setError(err)
      setBusy(false)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  return (
    <form className="form card" onSubmit={(event) => void submit(event)}>
      {Object.keys(errors).length > 0 ? (
        <p className="form-error" role="alert">
          Please check the highlighted fields.
        </p>
      ) : (
        <FormError error={error} />
      )}

      <Field label="Photos" errors={errors.imageUrls} hint="Up to 10 photos, 10 MB each. The first one is the cover.">
        {() => <ImagePicker urls={form.imageUrls} max={10} onChange={(urls) => set('imageUrls', urls)} />}
      </Field>

      <Field label="Title" errors={errors.title}>
        {(props) => (
          <input
            {...props}
            required
            minLength={3}
            maxLength={120}
            value={form.title}
            onChange={(event) => set('title', event.target.value)}
          />
        )}
      </Field>

      <Field label="Category" errors={errors.categoryId}>
        {(props) => (
          <select {...props} required value={form.categoryId} onChange={(event) => set('categoryId', event.target.value)}>
            <option value="" disabled>
              Choose a category
            </option>
            {categories.data?.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        )}
      </Field>

      <div className="form-row">
        <Field label="Price" errors={errors.price} hint="Enter 0 to give it away.">
          {(props) => (
            <input
              {...props}
              type="number"
              required
              min={0}
              step="0.01"
              inputMode="decimal"
              value={form.price}
              onChange={(event) => set('price', event.target.value)}
            />
          )}
        </Field>
        <Field label="Currency" errors={errors.currency}>
          {(props) => (
            <select {...props} value={form.currency} onChange={(event) => set('currency', event.target.value as Currency)}>
              {CURRENCIES.map((currency) => (
                <option key={currency}>{currency}</option>
              ))}
            </select>
          )}
        </Field>
      </div>

      <Field label="Description" errors={errors.description} hint="Condition, age, what is included, why you are selling.">
        {(props) => (
          <textarea
            {...props}
            required
            minLength={10}
            maxLength={5000}
            rows={7}
            value={form.description}
            onChange={(event) => set('description', event.target.value)}
          />
        )}
      </Field>

      <div className="form-row">
        <Field label="Location (optional)" errors={errors.location}>
          {(props) => (
            <input {...props} maxLength={120} placeholder="e.g. Zürich" value={form.location} onChange={(event) => set('location', event.target.value)} />
          )}
        </Field>
        <Field label="Phone (optional)" errors={errors.phone} hint="Shown to signed-in users only.">
          {(props) => (
            <input {...props} type="tel" maxLength={40} placeholder="+41 44 123 45 67" value={form.phone} onChange={(event) => set('phone', event.target.value)} />
          )}
        </Field>
      </div>

      <LocationPicker address={form.location} value={form.coordinates} onChange={(value) => set('coordinates', value)} />
      {errors.coordinates && <p className="field-error">{errors.coordinates.join('. ')}</p>}

      <div className="row">
        <Button type="submit" variant="primary" busy={busy}>
          {listing ? 'Save changes' : 'Publish listing'}
        </Button>
        <Button onClick={() => navigate(-1)}>Cancel</Button>
      </div>
    </form>
  )
}

export function ListingEditor() {
  const { id } = useParams()
  const { user } = useAuth()
  const existing = useQuery({ queryKey: keys.listing(id ?? ''), queryFn: () => listingApi.get(id ?? ''), enabled: Boolean(id) })
  useDocumentTitle(id ? 'Edit listing' : 'Sell an item')

  if (!id) {
    return (
      <div className="narrow">
        <PageHeader title="Sell an item" />
        {user && !user.isVerified ? (
          <EmptyState title="Confirm your e-mail address first">
            <p>We sent you a link when you registered. Listings can be published once it is confirmed.</p>
          </EmptyState>
        ) : (
          <EditorForm />
        )}
      </div>
    )
  }
  return (
    <div className="narrow">
      <PageHeader title="Edit listing" />
      <QueryView query={existing}>
        {(listing) =>
          listing.owner.id === user?.id ? (
            <EditorForm key={listing.id} listing={listing} />
          ) : (
            <EmptyState title="You can only edit your own listings" />
          )
        }
      </QueryView>
    </div>
  )
}
