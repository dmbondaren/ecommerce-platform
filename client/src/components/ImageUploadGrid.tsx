import { DragEvent } from 'react'

type ImageUploadGridProps = {
  imageSlots: Array<File | null>
  existingImages: string[]
  dragOverIndex: number | null
  draggingFrom: number | null
  isDraggingImage: boolean
  onDragOverSlot: (index: number) => void
  onDragLeaveSlot: () => void
  onDropToSlot: (index: number, event: DragEvent<HTMLLabelElement>) => void
  onInsertFiles: (files: File[]) => void
  onDragStartImage: (index: number) => void
  onDragEndImage: () => void
  onRemoveSlotImage: (index: number) => void
  onRemoveExtraSlot: (index: number) => void
  onAddSlot: () => void
}

export default function ImageUploadGrid({
  imageSlots,
  existingImages,
  dragOverIndex,
  draggingFrom,
  isDraggingImage,
  onDragOverSlot,
  onDragLeaveSlot,
  onDropToSlot,
  onInsertFiles,
  onDragStartImage,
  onDragEndImage,
  onRemoveSlotImage,
  onRemoveExtraSlot,
  onAddSlot
}: ImageUploadGridProps) {
  return (
    <div className='upload-grid'>
      {imageSlots.map((file, index) => (
        <label
          key={index}
          className={`upload-slot ${!file && dragOverIndex === index ? 'drag-over' : ''} ${draggingFrom === index ? 'dragging' : ''}`}
          onDragOver={(event) => { event.preventDefault(); onDragOverSlot(index) }}
          onDragLeave={onDragLeaveSlot}
          onDrop={(event) => onDropToSlot(index, event)}
        >
          {!file && <input type='file' multiple accept='image/*' onChange={(event) => onInsertFiles(Array.from(event.target.files || []))} />}
          {file ? (
            <div className={`upload-preview-wrap ${dragOverIndex === index && isDraggingImage ? 'target-hover' : ''}`}>
              <img
                draggable
                onDragStart={() => onDragStartImage(index)}
                onDragEnd={onDragEndImage}
                src={URL.createObjectURL(file)}
                alt={`Нове фото ${index + 1}`}
                className='upload-preview'
              />
              <button type='button' className='remove-photo-btn' onClick={(event) => { event.preventDefault(); index >= 6 ? onRemoveExtraSlot(index) : onRemoveSlotImage(index) }}>Видалити</button>
            </div>
          ) : existingImages[index] ? (
            <div className='upload-preview-wrap'>
              <img
                draggable
                onDragStart={() => onDragStartImage(index)}
                onDragEnd={onDragEndImage}
                src={existingImages[index]}
                alt={`Збережене фото ${index + 1}`}
                className='upload-preview'
              />
              <button type='button' className='remove-photo-btn' onClick={(event) => { event.preventDefault(); onRemoveSlotImage(index) }}>Видалити</button>
            </div>
          ) : (
            <span>{index === 0 ? 'Головне фото (показується першим)' : 'Порожня картка'}</span>
          )}
        </label>
      ))}
      <button type='button' className='upload-add' onClick={onAddSlot}>+</button>
    </div>
  )
}
