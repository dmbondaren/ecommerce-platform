import { useRef, useState } from 'react'
import { errorMessage } from '../api/client'
import { uploadImages } from '../api/endpoints'
import { toast } from '../app/toast'
import { Icon } from './Icon'

const MAX_BYTES = 10 * 1024 * 1024
const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif'

interface Props {
  urls: string[]
  max: number
  onChange: (urls: string[]) => void
}

/** Uploads photos as soon as they are chosen and lets the user order them; the first is the cover. */
export function ImagePicker({ urls, max, onChange }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  const add = async (list: FileList | null) => {
    const files = Array.from(list ?? []).slice(0, max - urls.length)
    if (files.length === 0) return
    const tooLarge = files.find((file) => file.size > MAX_BYTES)
    if (tooLarge) {
      toast.error(`“${tooLarge.name}” is larger than 10 MB`)
      return
    }
    setBusy(true)
    try {
      const uploaded = await uploadImages(files)
      onChange([...urls, ...uploaded.map((file) => file.url)])
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }

  const move = (index: number, to: number) => {
    const next = [...urls]
    const [item] = next.splice(index, 1)
    if (item) next.splice(to, 0, item)
    onChange(next)
  }

  return (
    <div className="image-picker">
      {urls.map((url, index) => (
        <figure key={url}>
          <img src={url} alt={`Photo ${index + 1}`} />
          {index === 0 && <figcaption className="badge badge-overlay">Cover</figcaption>}
          <div className="image-tools">
            {index > 0 && (
              <button type="button" onClick={() => move(index, index - 1)} aria-label={`Move photo ${index + 1} earlier`}>
                <Icon name="left" size={16} />
              </button>
            )}
            <button
              type="button"
              onClick={() => onChange(urls.filter((item) => item !== url))}
              aria-label={`Remove photo ${index + 1}`}
            >
              <Icon name="x" size={16} />
            </button>
          </div>
        </figure>
      ))}
      {urls.length < max && (
        <button type="button" className="image-add" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? <span className="spinner spinner-sm" /> : <Icon name="plus" />}
          <span>{busy ? 'Uploading…' : 'Add photos'}</span>
        </button>
      )}
      <input ref={input} type="file" accept={ACCEPT} multiple hidden onChange={(event) => void add(event.target.files)} />
    </div>
  )
}
