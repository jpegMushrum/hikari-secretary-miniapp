import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Trash2 } from 'lucide-react'
import { memberApi } from '../../shared/api'
import { ErrorState, Loading, PageHeader } from '../../shared/components'
import { dateTime } from '../../shared/format'
import { useList } from '../../shared/table'
import { FeedbackDialog } from './FeedbackDialog'
import { MemberModal } from './MemberModal'

type OwnFeedback = { id: number; text: string; event_id: number | null; event_title: string | null; created_at: string }

export default function FeedbackPage() {
  const client = useQueryClient()
  const list = useList<OwnFeedback>('/feedback', { sort: 'created_at', order: 'desc' }, [], 'member')
  const [compose, setCompose] = useState(false)
  const [selected, setSelected] = useState<OwnFeedback | null>(null)
  const [status, setStatus] = useState('')
  const remove = useMutation({
    mutationFn: (id: number) => memberApi('/feedback/' + id, { method: 'DELETE' }),
    onSuccess: () => {
      if (list.query.data?.items.length === 1 && list.page > 1) list.set('page', String(list.page - 1))
      void client.invalidateQueries({ queryKey: ['member', '/feedback'] })
      void client.invalidateQueries({ queryKey: ['/feedback'] })
      setSelected(null)
      setStatus('Отзыв удалён.')
    },
  })
  const data = list.query.data
  return (
    <>
      <PageHeader title="Отзывы" action={<button className="button primary" onClick={() => {
        setStatus('')
        setCompose(true)
      }}>Оставить отзыв</button>} />
      {status && <p role="status" className="muted">{status}</p>}
      {list.query.isPending ? <Loading /> : list.query.error ? (
        <ErrorState error={list.query.error} retry={() => void list.query.refetch()} />
      ) : data && (
        <>
          {data.items.length === 0 && <p className="empty-state">У вас пока нет отзывов.</p>}
          <ul className="member-feedback">
            {data.items.map(item => (
              <li key={item.id}>
                <div>
                  <strong>{item.event_id
                    ? <Link className="text-link" to={'/events/' + item.event_id}>{item.event_title || 'Мероприятие'}</Link>
                    : 'О клубе в целом'}</strong>
                  <time className="muted" dateTime={item.created_at}>{dateTime(item.created_at)}</time>
                  <p>{item.text}</p>
                </div>
                <button className="icon-button" aria-label="Удалить отзыв" onClick={() => {
                  remove.reset()
                  setStatus('')
                  setSelected(item)
                }}><Trash2 size={18} /></button>
              </li>
            ))}
          </ul>
          {(data.page.total_pages > 1 || list.page > 1) && (
            <nav className="member-pagination" aria-label="Страницы отзывов">
              <button className="icon-button" aria-label="Предыдущая страница" disabled={list.page <= 1}
                onClick={() => list.set('page', String(list.page - 1))}><ChevronLeft size={18} /></button>
              <span>{list.page} / {Math.max(1, data.page.total_pages)}</span>
              <button className="icon-button" aria-label="Следующая страница" disabled={list.page >= data.page.total_pages}
                onClick={() => list.set('page', String(list.page + 1))}><ChevronRight size={18} /></button>
            </nav>
          )}
        </>
      )}
      {compose && <FeedbackDialog onClose={() => setCompose(false)} onSent={() => {
          list.set('page', '1')
          setCompose(false)
          setStatus('Отзыв отправлен.')
      }} />}
      {selected && <MemberModal title="Вы уверены, что хотите удалить отзыв?" busy={remove.isPending}
        onClose={() => setSelected(null)}>
        <p className="member-delete-preview">{selected.text}</p>
        <div className="button-row">
          <button className="button secondary" disabled={remove.isPending} onClick={() => setSelected(null)}>Оставить</button>
          <button className="button primary" disabled={remove.isPending} onClick={() => remove.mutate(selected.id)}>Удалить</button>
        </div>
        {remove.error && <ErrorState error={remove.error} />}
      </MemberModal>}
    </>
  )
}
