import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api, type FeedbackDetail as Detail } from '../../shared/api'
import { BackLink, ErrorState, Loading, PageHeader } from '../../shared/components'
import { TelegramLink, TelegramMentions } from '../../shared/TelegramLink'
import { dateTime } from '../../shared/format'
export default function FeedbackDetail() {
  const { id } = useParams()
  const query = useQuery({
    queryKey: ['feedback', id],
    queryFn: ({ signal }) => api<Detail>('/feedback/' + id, { signal }),
  })
  if (query.isPending) return <Loading />
  if (query.error) return <ErrorState error={query.error} retry={() => void query.refetch()} />
  const f = query.data
  return (
    <>
      <BackLink to="/admin/feedback">На главную</BackLink>
      <PageHeader title={f.event_title || 'Отзыв о клубе'} description={dateTime(f.created_at)} />
      <div className="feedback-author">
        <span className="avatar">{(f.full_name || '?').slice(0, 1)}</span>
        <div>
          <strong>
            <TelegramMentions text={f.full_name || 'Участник #' + f.person_id} />
          </strong>
          <small>
            {f.username ? (
              <TelegramLink username={f.username} id={f.telegram_user_id} />
            ) : (
              'Telegram ID ' + f.telegram_user_id
            )}
          </small>
        </div>
      </div>
      <blockquote className="feedback-body">
        <TelegramMentions text={f.text} />
      </blockquote>
      {f.event_id && (
        <Link className="button secondary" to={'/admin/events/' + f.event_id}>
          Перейти к мероприятию
        </Link>
      )}
    </>
  )
}
