import { useId, useRef, useState, type ReactNode } from 'react'
import { ArrowUpRight, ImagePlus } from 'lucide-react'
import { memberApi } from '../../shared/api'
import { ErrorState } from '../../shared/components'
import { ProtectedImage } from '../../shared/ProtectedImage'
import { MemberModal } from '../member/MemberModal'
import { PhotoAttachments } from './PhotoAttachments'
import { discardImages, type Entry, type ImageRef, type Scope, type Send } from './model'
import './entries.css'

export function EntryCard({ entry, scope, showTitle = true }: { entry: Entry; scope: Scope; showTitle?: boolean }) {
  return <article className="mascot-card">
    {showTitle && <h3>{entry.name}</h3>}
    <p className="mascot-description">{entry.description}</p>
    <div className="mascot-gallery">{entry.images.map((image, i) =>
      <figure key={image.key}>
        <ProtectedImage path={'/mascot/images/' + image.key} member={scope === 'member'} alt={entry.name + ', изображение ' + (i + 1)} />
        {image.ai && <figcaption>Создано с помощью ИИ</figcaption>}
      </figure>)}</div>
  </article>
}

export function EntryPreview({ entry, scope, meta, children }: {
  entry: Entry; scope: Scope; meta?: ReactNode; children?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  return <article className="mascot-preview">
    <button type="button" className="mascot-preview-link" aria-label={`Открыть концепт «${entry.name}»`}
      aria-haspopup="dialog" onClick={() => setOpen(true)}>
      <strong>{entry.name}</strong>
      <ArrowUpRight size={18} aria-hidden="true" />
      <span>{entry.description}</span>
    </button>
    {meta && <div className="mascot-preview-meta">{meta}</div>}
    {children}
    {open && <MemberModal title={entry.name} large onClose={() => setOpen(false)}>
      <EntryCard entry={entry} scope={scope} showTitle={false} />
    </MemberModal>}
  </article>
}

export function EntryForm({ entry, seasonID, eligible, busy, send, close }: {
  entry?: Entry; seasonID: number; eligible: boolean; busy: boolean; send: Send; close: () => void
}) {
  const [name, setName] = useState(entry?.name ?? '')
  const [description, setDescription] = useState(entry?.description ?? '')
  const [images, setImages] = useState<ImageRef[]>(entry?.images ?? [])
  const [fileAction, setFileAction] = useState<'upload' | 'delete' | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [requestID] = useState(() => crypto.randomUUID())
  const pendingUpload = useRef(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const fileHint = useId()
  const pending = busy || !!fileAction
  const locked = pending || !eligible
  const attached = new Set(entry?.images.map(image => image.key))
  async function add(files: File[]) {
    if (locked || !files.length || pendingUpload.current) return
    setError(null)
    if (files.length + images.length > 3) {
      setError(new Error('Можно прикрепить до трёх изображений.'))
      return
    }
    if (files.some(file => !['image/jpeg', 'image/png'].includes(file.type) || file.size > 8 * 1024 * 1024)) {
      setError(new Error('Выберите JPEG или PNG размером до 8 МиБ.'))
      return
    }
    pendingUpload.current = true
    setFileAction('upload')
    const uploaded: string[] = []
    try {
      for (const file of files) {
        const { key } = await memberApi<{ key: string }>('/mascot/images?season_id=' + seasonID, { method: 'POST', body: file })
        uploaded.push(key)
      }
      setImages(current => [...current, ...uploaded.map(key => ({ key, ai: false }))])
    } catch (cause) {
      const failed = await discardImages(uploaded)
      setImages(current => [...current, ...failed.map(key => ({ key, ai: false }))])
      setError(cause as Error)
    } finally { pendingUpload.current = false; setFileAction(null) }
  }
  async function remove(keys: string[], cancel = false) {
    setError(null)
    setFileAction('delete')
    const failed = await discardImages(keys.filter(key => !attached.has(key)))
    setImages(current => current.filter(image => !keys.includes(image.key) || failed.includes(image.key)))
    setFileAction(null)
    if (failed.length) setError(new Error('Не удалось удалить все загрузки. Повторите попытку.'))
    else if (cancel) close()
  }
  return <form className="mascot-form" onSubmit={async event => {
    event.preventDefault()
    if (locked || !name.trim() || !description.trim() || !images.length) return
    try {
      await send({ action: 'submit', entry_id: entry?.id ?? 0, name: name.trim(), description: description.trim(), images, request_id: requestID })
      close()
    } catch { /* The page shows the action error and keeps the form open. */ }
  }}>
    <h2>{entry ? 'Редактировать концепт' : 'Новый концепт'}</h2>
    <label>Имя маскота<input required maxLength={120} value={name} disabled={locked} onChange={e => setName(e.target.value)} /></label>
    <label>Описание<textarea required rows={4} maxLength={2000} value={description} disabled={locked} onChange={e => setDescription(e.target.value)} /></label>
    <p className="muted">Покажите идею маскота рисунком, скриншотом 3D-модели или эскизом. Аватарку клуба подготовят отдельно. Можно использовать ИИ.</p>
    {images.length > 0 && <PhotoAttachments images={images} locked={locked} onRemove={key => void remove([key])}
      onToggleAI={key => setImages(current => current.map(item => item.key === key ? { ...item, ai: !item.ai } : item))} />}
    {images.length < 3 && <div className="mascot-attachments">
      <div className="button-row">
        <button type="button" className="button secondary" disabled={locked} aria-describedby={fileHint}
          onClick={() => fileInput.current?.click()}>
          <ImagePlus size={18} aria-hidden="true" />Добавить изображения
        </button>
      </div>
      <input type="file" ref={fileInput} hidden aria-label="Добавить изображения" multiple accept="image/jpeg,image/png" disabled={locked}
        onChange={e => { const files = [...e.target.files ?? []]; e.target.value = ''; void add(files) }} />
      <small id={fileHint} className="muted">От 1 до 3 изображений, JPEG или PNG до 8 МиБ каждое.</small>
    </div>}
    {fileAction && <p role="status">{fileAction === 'upload' ? 'Загружаем изображения…' : 'Удаляем загрузки…'}</p>}
    {error && <ErrorState error={error} />}
    <div className="button-row">
      <button className="button primary" disabled={locked || !name.trim() || !description.trim() || !images.length}>Сохранить заявку</button>
      <button className="button secondary" type="button" disabled={pending} onClick={() => void remove(images.filter(image => !attached.has(image.key)).map(image => image.key), true)}>Отмена</button>
    </div>
  </form>
}
