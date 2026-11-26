import { useId, useState } from 'react'
import { X } from 'lucide-react'
import { ProtectedImage } from '../../shared/ProtectedImage'
import { MemberModal } from '../member/MemberModal'
import type { ImageRef } from './model'

export function PhotoAttachments({ images, locked, onRemove, onToggleAI }: {
  images: ImageRef[]
  locked: boolean
  onRemove: (key: string) => void
  onToggleAI: (key: string) => void
}) {
  const hintID = useId()
  const [previewKey, setPreviewKey] = useState<string>()
  const preview = images.findIndex(image => image.key === previewKey)
  return <div className="mascot-attachments" role="group" aria-label="Прикреплённые изображения" aria-describedby={hintID}>
    <ul className="mascot-photo-strip">
      {images.map((image, index) => {
        const label = 'Изображение ' + (index + 1)
        return <li key={image.key}>
          <div className="mascot-photo">
            <button type="button" className="mascot-photo-open" aria-label={'Увеличить изображение ' + (index + 1)}
              aria-haspopup="dialog" onClick={() => setPreviewKey(image.key)}>
              <ProtectedImage path={'/mascot/images/' + image.key} member alt={label} />
            </button>
            <button type="button" className="mascot-photo-remove" disabled={locked}
              aria-label={'Убрать изображение ' + (index + 1)} onClick={() => onRemove(image.key)}>
              <X size={16} aria-hidden="true" />
            </button>
          </div>
          <label className="mascot-photo-ai">
            <input type="checkbox" checked={image.ai} disabled={locked}
              aria-label={label + ' создано с помощью ИИ'} onChange={() => onToggleAI(image.key)} />
            ИИ
          </label>
        </li>
      })}
    </ul>
    <small id={hintID} className="muted">Отметьте, какие концепты создавались с ИИ.</small>
    {preview >= 0 && <MemberModal title={'Изображение ' + (preview + 1)} large onClose={() => setPreviewKey(undefined)}>
      <div className="mascot-gallery"><figure>
        <ProtectedImage path={'/mascot/images/' + images[preview].key} member alt={'Изображение ' + (preview + 1)} />
        {images[preview].ai && <figcaption>Создано с помощью ИИ</figcaption>}
      </figure></div>
    </MemberModal>}
  </div>
}
