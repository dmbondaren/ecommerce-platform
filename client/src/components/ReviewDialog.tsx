import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { orderApi } from '../api/endpoints'
import type { Order } from '../api/types'
import { t } from '../app/i18n'
import { keys } from '../app/queryClient'
import { toast } from '../app/toast'
import { Button, Field, FormError, Modal, Stars, fieldErrors } from './ui'

export function ReviewDialog({ order, onClose }: { order: Order; onClose: () => void }) {
  const client = useQueryClient()
  const [rating, setRating] = useState(5)
  const [comment, setComment] = useState('')
  const [pros, setPros] = useState('')
  const [cons, setCons] = useState('')
  const review = useMutation({
    mutationFn: () => orderApi.review(order.id, { rating, comment, pros, cons }),
    meta: { silent: true },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: keys.purchases })
      toast.success(t('Thank you for your review'))
      onClose()
    },
  })
  const errors = fieldErrors(review.error)
  const submit = (event: FormEvent) => {
    event.preventDefault()
    review.mutate()
  }

  return (
    <Modal title={`Review: ${order.title}`} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="modal-body">
          <Stars value={rating} onChange={setRating} />
          <Field label={t('How did it go? (optional)')} errors={errors.comment}>
            {(props) => <textarea {...props} rows={4} maxLength={2000} value={comment} onChange={(event) => setComment(event.target.value)} />}
          </Field>
          <Field label={t('What you liked (optional)')} errors={errors.pros}>
            {(props) => <input {...props} maxLength={500} value={pros} onChange={(event) => setPros(event.target.value)} />}
          </Field>
          <Field label={t('What could be better (optional)')} errors={errors.cons}>
            {(props) => <input {...props} maxLength={500} value={cons} onChange={(event) => setCons(event.target.value)} />}
          </Field>
          {Object.keys(errors).length === 0 && <FormError error={review.error} />}
        </div>
        <footer className="modal-footer">
          <Button onClick={onClose}>{t('Cancel')}</Button>
          <Button type="submit" variant="primary" busy={review.isPending}>
            {t('Publish review')}
          </Button>
        </footer>
      </form>
    </Modal>
  )
}

