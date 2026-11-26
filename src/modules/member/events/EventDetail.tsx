import { useState } from 'react'
import { ReminderPicker } from './ReminderPicker'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation, useParams } from 'react-router-dom'
import { ApiError, memberApi } from '../../../shared/api'
import { BackLink, ErrorState, Loading, PageHeader, Status } from '../../../shared/components'
import { dateTime } from '../../../shared/format'
import { TelegramMentions } from '../../../shared/TelegramLink'
import { PublicationPreview, safeLink } from '../../publications/PublicationPreview'
import { FeedbackDialog } from '../FeedbackDialog'
import { MemberModal } from '../MemberModal'
import { RegistrationDialog } from './RegistrationDialog'
import { personalStatuses, type EventCard, type RegistrationProfile } from './model'
import './events.css'

export default function MemberEventDetail() {
  const { id = '' } = useParams()
  return <EventPage key={id} id={id} />
}

function EventPage({ id }: { id: string }) {
  const [firstVisitAdmin, setFirstVisitAdmin] = useState<string | null>(null)
  const { state } = useLocation()
  const from =
    typeof state?.from === 'string' && /^\/events(?:\?|$)/.test(state.from) ? state.from : '/events'
  const event = useQuery({
    queryKey: ['member', 'event', id],
    queryFn: ({ signal }) => memberApi<EventCard>('/events/' + id, { signal }),
    refetchInterval: 30000,
  })
  const accessLost = event.error instanceof ApiError && [401, 403, 404].includes(event.error.status)
  return (
    <>
      <BackLink to={from}>К мероприятиям</BackLink>
      {event.isPending ? (
        <Loading />
      ) : event.error ? (
        <ErrorState error={event.error} retry={() => void event.refetch()} />
      ) : (
        <MemberEvent event={event.data} onFirstVisit={setFirstVisitAdmin} />
      )}
      {firstVisitAdmin && !accessLost && (
        <MemberModal title="Вы зарегистрированы" onClose={() => setFirstVisitAdmin(null)}>
          <p>
            Перед первой встречей обязательно напишите администратору{' '}
            <TelegramMentions text={'@' + firstVisitAdmin} /> в личные сообщения.
            Для оформления пропуска понадобятся ваши персональные данные.
          </p>
          <p>В дальнейшем при записи на встречу регистрация пройдёт автоматически. Повторно писать администратору не нужно.</p>
        </MemberModal>
      )}
    </>
  )
}

function MemberEvent({ event, onFirstVisit }: { event: EventCard; onFirstVisit: (username: string) => void }) {
  const client = useQueryClient()
  const [registration, setRegistration] = useState<{ minutes: number | null } | null>(null)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [feedbackSent, setFeedbackSent] = useState(false)
  const base = '/events/' + event.id
  const change = useMutation({
    mutationFn: ({ path, method, body }: { path: string; method: string; body?: object }) =>
      memberApi<{ first_visit_admin_username?: string } | void>(base + path, {
        method,
        ...(body && { body: JSON.stringify(body) }),
      }),
    onSuccess: (result) => {
      setRegistration(null)
      if (result?.first_visit_admin_username) onFirstVisit(result.first_visit_admin_username)
    },
    onSettled: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: ['member', 'event', String(event.id)] }),
        client.invalidateQueries({ queryKey: ['member', '/events'] }),
        client.invalidateQueries({ queryKey: ['member', 'profile'] }),
      ]),
  })
  const register = (minutes: number | null, profile?: RegistrationProfile) => {
    change.mutate({
      path: '/registration',
      method: 'POST',
      body: { reminder_offset_minutes: minutes, profile },
    })
  }
  const reminder = useMutation({
    mutationFn: (minutes: number | null) =>
      memberApi<void>(event.can_manage_registration ? base + '/registration' : '/profile', {
        method: 'PATCH',
        body: JSON.stringify({ reminder_offset_minutes: minutes }),
      }),
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: ['member', 'event'] }),
        client.invalidateQueries({ queryKey: ['member', 'profile'] }),
      ]),
  })
  const preferred = event.preferred_reminder_offset_minutes
  const availablePreference =
    preferred !== null && event.reminder_options.includes(preferred) ? preferred : null
  const minutes = reminder.isPending
    ? reminder.variables
    : event.can_manage_registration
      ? event.reminder_offset_minutes
      : availablePreference
  const busy = change.isPending || reminder.isPending
  function startRegistration() {
    if (event.profile_complete) {
      register(minutes)
    } else {
      change.reset()
      setRegistration({ minutes })
    }
  }
  const announcementURL = safeLink(event.announcement_url)
  return (
    <>
      <PageHeader
        title={event.title}
        description={dateTime(event.starts_at) + ' — ' + dateTime(event.ends_at)}
        action={<Status value={event.status} />}
      />
      <p className="member-personal-status">
        Мой статус · <strong className={'status-' + event.personal_status}>{personalStatuses[event.personal_status]}</strong>
      </p>
      {event.announcement && (
        <PublicationPreview publication={event.announcement} memberEventId={event.id} />
      )}
      {announcementURL && (
        <a className="text-link" href={announcementURL} target="_blank" rel="noopener noreferrer">
          Открыть в Telegram ↗
        </a>
      )}
      {(event.can_register || event.can_manage_registration) && (
        <section className="member-event-actions member-registration">
          <div className="member-registration-controls">
            {event.can_register && (
              <button className="button primary" disabled={busy} onClick={startRegistration}>
                Зарегистрироваться
              </button>
            )}
            <ReminderPicker value={minutes} options={event.reminder_options} disabled={busy}
              onChange={(offset) => reminder.mutate(offset)} />
          </div>
          {reminder.error && <ErrorState error={reminder.error} />}
          {event.can_manage_registration && (
            <button
              className="button secondary member-cancel-registration"
              disabled={busy}
              onClick={() => change.mutate({ path: '/registration', method: 'DELETE' })}
            >
              Отменить регистрацию
            </button>
          )}
        </section>
      )}
      {event.can_mark_attendance && (
        <section className="member-event-actions">
          <h2>Вы были на встрече?</h2>
          <div className="button-row">
            {[true, false].map((attended) => (
              <button
                key={String(attended)}
                className="button secondary"
                disabled={change.isPending}
                onClick={() =>
                  change.mutate({ path: '/attendance', method: 'PUT', body: { attended } })
                }
              >
                {attended ? 'Да, был' : 'Нет, не был'}
              </button>
            ))}
          </div>
        </section>
      )}
      {!registration && change.error && <ErrorState error={change.error} />}
      {event.can_leave_feedback && (
        <div className="detail-actions">
          <button
            className="button secondary"
            onClick={() => {
              setFeedbackSent(false)
              setFeedbackOpen(true)
            }}
          >
            Оставить отзыв
          </button>
          {feedbackSent && (
            <span className="muted" role="status">
              Отзыв сохранён
            </span>
          )}
        </div>
      )}
      {registration && (
        <RegistrationDialog
          busy={change.isPending}
          error={change.error}
          onClose={() => {
            setRegistration(null)
            change.reset()
          }}
          onSave={(profile) => register(registration.minutes, profile)}
        />
      )}
      {feedbackOpen && (
        <FeedbackDialog
          onClose={() => setFeedbackOpen(false)}
          eventId={event.id}
          onSent={() => {
            setFeedbackOpen(false)
            setFeedbackSent(true)
          }}
        />
      )}
    </>
  )
}
