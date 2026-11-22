import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { memberApi } from '../../shared/api'
import { ErrorState } from '../../shared/components'
import { MemberModal } from './MemberModal'

export function FeedbackDialog({
  eventId,
  onClose,
  onSent,
}: {
  eventId?: number
  onClose: () => void
  onSent: () => void
}) {
  const [text, setText] = useState('')
  const client = useQueryClient()
  const send = useMutation({
    mutationFn: () =>
      memberApi('/feedback', {
        method: 'POST',
        body: JSON.stringify({ text: text.trim(), event_id: eventId }),
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['member', '/feedback'] })
      void client.invalidateQueries({ queryKey: ['/feedback'] })
      onSent()
    },
  })
  function submit(event: FormEvent) {
    event.preventDefault()
    if (text.trim() && !send.isPending) send.mutate()
  }
  return (
    <MemberModal
      title={eventId === undefined ? 'Оставить отзыв о клубе' : 'Отзыв о мероприятии'}
      busy={send.isPending}
      onClose={onClose}
    >
      <form className="member-form" onSubmit={submit}>
        <label>
          Текст отзыва
          <textarea
            required
            maxLength={3000}
            rows={5}
            value={text}
            disabled={send.isPending}
            onChange={(event) => setText(event.target.value)}
          />
        </label>
        <button className="button primary" disabled={!text.trim() || send.isPending}>
          {send.isPending ? 'Отправляем…' : 'Отправить отзыв'}
        </button>
        {send.error && <ErrorState error={send.error} />}
      </form>
    </MemberModal>
  )
}
