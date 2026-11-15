import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { listingApi } from '../api/endpoints'
import type { Coordinates, Currency, Listing, ListingInput } from '../api/types'
import { useAuth } from '../app/auth'
import { useDocumentTitle } from '../app/hooks'
import { keys } from '../app/queryClient'
import { toast } from '../app/toast'
import { ImagePicker } from '../components/ImagePicker'
import { LocationPicker } from '../components/LocationPicker'
import { Button, EmptyState, Field, FormError, PageHeader, QueryView, Spinner, fieldErrors } from '../components/ui'
import { t } from '../app/i18n'

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
  paymentAccount: string
}

/**
 * `listing` is edited in place. `template` only fills in the form: saving
 * creates a new listing, which is how a sold item is offered again.
 */
function EditorForm({ listing, template }: { listing?: Listing; template?: Listing }) {
  const source = listing ?? template
  const { user, setUser } = useAuth()
  const navigate = useNavigate()
  const client = useQueryClient()
  const categories = useQuery({ queryKey: keys.categories, queryFn: listingApi.categories, staleTime: Infinity })
  const [form, setForm] = useState<FormState>({
    title: source?.title ?? '',
    description: source?.description ?? '',
    price: source ? String(source.price) : '',
    currency: source?.currency ?? user?.preferredCurrency ?? 'CHF',
    categoryId: source ? String(source.category.id) : '',
    location: source?.location ?? '',
    phone: source?.phone ?? user?.phone ?? '',
    imageUrls: source?.imageUrls ?? [],
    coordinates: source?.coordinates ?? null,
    // Remembered from the user's last listing, so it only has to be typed once.
    paymentAccount: user?.paymentAccount ?? '',
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
      // The payment account just saved is the default for the next listing.
      if (user && form.paymentAccount.trim()) setUser({ ...user, paymentAccount: form.paymentAccount.trim() })
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
          {t('Please check the highlighted fields.')}
        </p>
      ) : (
        <FormError error={error} />
      )}

      <Field label={t('Photos')} errors={errors.imageUrls} hint={t('Up to 10 photos, 10 MB each. The first one is the cover.')}>
        {() => <ImagePicker urls={form.imageUrls} max={10} onChange={(urls) => set('imageUrls', urls)} />}
      </Field>

      <Field label={t('Title')} errors={errors.title}>
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

      <Field label={t('Category')} errors={errors.categoryId}>
        {(props) => (
          <select {...props} required value={form.categoryId} onChange={(event) => set('categoryId', event.target.value)}>
            <option value="" disabled>
              {t('Choose a category')}
            </option>
            {categories.data?.map((category) => (
              <option key={category.id} value={category.id}>
                {t(category.name)}
              </option>
            ))}
          </select>
        )}
      </Field>

      <div className="form-row">
        <Field label={t('Price')} errors={errors.price} hint={t('Enter 0 to give it away.')}>
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
        <Field label={t('Currency')} errors={errors.currency}>
          {(props) => (
            <select {...props} value={form.currency} onChange={(event) => set('currency', event.target.value as Currency)}>
              {CURRENCIES.map((currency) => (
                <option key={currency}>{currency}</option>
              ))}
            </select>
          )}
        </Field>
      </div>

      <Field label={t('Description')} errors={errors.description} hint={t('Condition, age, what is included, why you are selling.')}>
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
        <Field label={t('Location (optional)')} errors={errors.location}>
          {(props) => (
            <input {...props} maxLength={120} placeholder={t('e.g. Zürich')} value={form.location} onChange={(event) => set('location', event.target.value)} />
          )}
        </Field>
        <Field label={t('Phone (optional)')} errors={errors.phone} hint={t('Shown to signed-in users only.')}>
          {(props) => (
            <input {...props} type="tel" maxLength={40} placeholder="+41 44 123 45 67" value={form.phone} onChange={(event) => set('phone', event.target.value)} />
          )}
        </Field>
      </div>

      <Field
        label={t('Account for payments (optional)')}
        errors={errors.paymentAccount}
        hint={t('For example your IBAN. A buyer sees it only after reserving the item. It is remembered for your next listings.')}
      >
        {(props) => (
          <input
            {...props}
            maxLength={64}
            autoComplete="off"
            placeholder="CH00 0000 0000 0000 0000 0"
            value={form.paymentAccount}
            onChange={(event) => set('paymentAccount', event.target.value)}
          />
        )}
      </Field>

      <LocationPicker
        address={form.location}
        value={form.coordinates}
        onChange={(value) => set('coordinates', value)}
        onAddressChange={(address) => set('location', address)}
      />
      {errors.coordinates && <p className="field-error">{errors.coordinates.join('. ')}</p>}

      <div className="row">
        <Button type="submit" variant="primary" busy={busy}>
          {listing ? t('Save changes') : t('Publish listing')}
        </Button>
        <Button onClick={() => navigate(-1)}>{t('Cancel')}</Button>
      </div>
    </form>
  )
}

export function ListingEditor() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const { user } = useAuth()
  // "/sell?from=<id>" starts a new listing from one of the user's own, e.g. a sold one.
  const templateId = id ? null : params.get('from')
  const sourceId = id ?? templateId ?? ''
  const existing = useQuery({
    queryKey: keys.listing(sourceId),
    queryFn: () => listingApi.get(sourceId),
    enabled: Boolean(sourceId),
  })
  useDocumentTitle(id ? t('Edit listing') : t('Sell an item'))
  const template = templateId && existing.data?.owner.id === user?.id ? existing.data : undefined

  if (!id) {
    return (
      <div className="narrow">
        <PageHeader title={t('Sell an item')} />
        {user && !user.isVerified ? (
          <EmptyState title={t('Confirm your e-mail address first')}>
            <p>{t('We sent you a link when you registered. Listings can be published once it is confirmed.')}</p>
          </EmptyState>
        ) : templateId && existing.isPending ? (
          <Spinner />
        ) : (
          <>
            {template && (
              <p className="notice" role="status">
                {t('Copied from your earlier listing. Check the details and photos, then publish it as a new listing.')}
              </p>
            )}
            <EditorForm key={template?.id ?? 'new'} template={template} />
          </>
        )}
      </div>
    )
  }
  return (
    <div className="narrow">
      <PageHeader title={t('Edit listing')} />
      <QueryView query={existing}>
        {(listing) =>
          listing.owner.id === user?.id ? (
            <EditorForm key={listing.id} listing={listing} />
          ) : (
            <EmptyState title={t('You can only edit your own listings')} />
          )
        }
      </QueryView>
    </div>
  )
}
