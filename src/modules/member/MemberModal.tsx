import { useEffect, useId, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import './member.css'

export function MemberModal({ title, children, onClose, large = false, busy = false }: {
  title: string
  children: ReactNode
  onClose: () => void
  large?: boolean
  busy?: boolean
}) {
  const titleId = useId()
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current!
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialog.showModal()
    return () => {
      dialog.close()
      document.body.style.overflow = overflow
    }
  }, [])
  return (
    <dialog ref={ref} className={'member-modal' + (large ? ' member-modal-large' : '')}
      aria-labelledby={titleId} onCancel={(event) => {
        event.preventDefault()
        if (!busy) onClose()
      }}>
      <header>
        <h2 id={titleId}>{title}</h2>
        <button type="button" className="icon-button" aria-label="Закрыть" disabled={busy} onClick={onClose}>
          <X size={20} />
        </button>
      </header>
      {children}
    </dialog>
  )
}
