import { useState, useContext } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { api, ApiError, type ClubEvent, type Participant, type Publication } from '../../shared/api'
import {
  BackLink,
  PageHeader,
  ErrorState,
  Loading,
  Status,
  SelectFilter,
  booleanOptions,
} from '../../shared/components'
import { AdministratorContext, DataTable, useList } from '../../shared/table'
import { dateTime, yesNo } from '../../shared/format'
import { TelegramLink } from '../../shared/TelegramLink'
import { PublicationPreview } from '../publications/PublicationPreview'

export default function EventDetail() {
  const { id } = useParams()
  const location = useLocation()
  const client = useQueryClient()
  const admin = useContext(AdministratorContext)
  const preferenceKey = 'hikari.participant-view.' + admin
  const [view, setView] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(preferenceKey) || '{}')
      return {
        compactStatus: saved?.compactStatus === true,
      }
    } catch {
      return { compactStatus: false }
    }
  })
  const saveView = (next: typeof view) => {
    setView(next)
    try {
      localStorage.setItem(preferenceKey, JSON.stringify(next))
    } catch {}
  }
  const [confirm, setConfirm] = useState(false)
  const event = useQuery({
    queryKey: ['event', id],
    queryFn: ({ signal }) => api<ClubEvent>('/events/' + id, { signal }),
  })
  const publication = useQuery({
    queryKey: ['publication', event.data?.publication_id],
    enabled: !!event.data?.publication_id,
    queryFn: ({ signal }) =>
      api<Publication>('/publications/' + event.data?.publication_id, { signal }),
  })
  const list = useList<Participant>('/events/' + id + '/participants', { sort: 'name' }, [
    'status',
    'needs_pass',
    'is_itmo_student',
    'is_russian_citizen',
  ])
  const cancel = useMutation({
    mutationFn: () => api('/events/' + id + '/cancel', { method: 'POST' }),
    onSuccess: () => {
      setConfirm(false)
      void client.invalidateQueries()
    },
  })
  const publish = useMutation({
    mutationFn: () =>
      api('/publications/' + event.data?.publication_id + '/schedule', {
        method: 'POST',
        body: '{}',
      }),
    onSuccess: () => void client.invalidateQueries(),
  })
  const columns: ColumnDef<Participant, unknown>[] = [
    { id: 'name', accessorKey: 'full_name', header: 'Участник', enableHiding: false },
    {
      id: 'telegram',
      header: 'Telegram',
      enableSorting: false,
      cell: ({ row }) => (
        <TelegramLink username={row.original.username} id={row.original.telegram_user_id} />
      ),
    },
    {
      accessorKey: 'registered_at',
      header: 'Регистрация',
      cell: (i) => dateTime(i.getValue() as string),
    },
    {
      accessorKey: 'status',
      header: 'Статус',
      enableSorting: false,
      cell: (i) => (
        <Status
          value={i.getValue() as string}
          compact={view.compactStatus}
          label={i.getValue() === 'cancelled' ? 'Регистрация отменена' : undefined}
        />
      ),
    },
    {
      accessorKey: 'attended',
      header: 'Был на встрече',
      enableSorting: false,
      cell: (i) => yesNo(i.getValue() as boolean | null),
    },
    {
      accessorKey: 'needs_pass',
      header: 'Нужен пропуск',
      cell: ({ row }) => (
        <span
          title={`Гражданин РФ: ${yesNo(row.original.is_russian_citizen)}; Студент ИТМО: ${yesNo(row.original.is_itmo_student)}`}
        >
          {row.original.is_russian_citizen == null || row.original.is_itmo_student == null
            ? row.original.is_russian_citizen === false || row.original.is_itmo_student === false
              ? 'Да'
              : 'Уточнить данные'
            : yesNo(row.original.needs_pass)}
        </span>
      ),
    },
    {
      accessorKey: 'is_russian_citizen',
      header: 'Гражданин РФ',
      enableSorting: false,
      cell: (i) => yesNo(i.getValue() as boolean | null),
    },
    {
      accessorKey: 'is_itmo_student',
      header: 'Студент ИТМО',
      enableSorting: false,
      cell: (i) => yesNo(i.getValue() as boolean | null),
    },
  ]
  if (event.isPending) return <Loading />
  if (event.error) return <ErrorState error={event.error} retry={() => void event.refetch()} />
  const e = event.data
  return (
    <>
      <BackLink to={location.state?.from || '/admin/events'}>Мероприятия</BackLink>
      <PageHeader
        title={e.title}
        description={dateTime(e.starts_at) + ' — ' + dateTime(e.ends_at)}
        action={<Status value={e.status} />}
      />
      <div className="metrics">
        <div>
          <strong>{e.registrations}</strong>
          <span>регистраций</span>
        </div>
        <div>
          <strong>{e.attended}</strong>
          <span>подтвердили посещение</span>
        </div>
        <div>
          <strong>{e.cancelled_registrations}</strong>
          <span>отмен регистраций</span>
        </div>
      </div>
      <div className="detail-actions">
        <Link className="button secondary" to={'/admin/feedback?event_id=' + id}>
          Отзывы о встрече
        </Link>
        {e.status === 'active' && (
          <button className="button secondary" onClick={() => setConfirm(true)}>
            Отменить мероприятие
          </button>
        )}
      </div>
      {confirm && (
        <div className="notice">
          <div>
            <strong>Отменить «{e.title}»?</strong>
            <p>Участники получат уведомления. Регистрация на встречу закроется.</p>
            <div className="button-row">
              <button
                className="button primary"
                disabled={cancel.isPending}
                onClick={() => cancel.mutate()}
              >
                Подтвердить отмену
              </button>
              <button className="button secondary" onClick={() => setConfirm(false)}>
                Оставить мероприятие
              </button>
            </div>
          </div>
        </div>
      )}
      {cancel.error && <ErrorState error={cancel.error} />}
      {publication.isFetching && <p className="muted">Загружаем анонс…</p>}
      {publication.error &&
        (publication.error instanceof ApiError && publication.error.status === 404 ? (
          <p className="muted">Анонс этой встречи недоступен для просмотра.</p>
        ) : (
          <ErrorState error={publication.error} retry={() => void publication.refetch()} />
        ))}
      {publication.data && (
        <details className="publication-preview">
          <summary>
            Анонс мероприятия{' '}
            <span className="inline-status">
              <Status value={publication.data.status} />
            </span>
          </summary>
          <PublicationPreview publication={publication.data} />
          <Link className="text-link" to={'/admin/publications/' + publication.data.id}>
            Настройки публикации →
          </Link>
          <ul className="publication-deliveries">
            {publication.data.deliveries.map((d, i) => (
              <li key={i}>
                {d.target_name}{' '}
                <span className="inline-status">
                  <Status value={d.status} />
                </span>
                {d.last_error && <p>{d.last_error}</p>}
              </li>
            ))}
          </ul>
          {publication.data.status === 'draft' && e.status === 'active' && (
            <button
              className="button secondary"
              disabled={publish.isPending}
              onClick={() => publish.mutate()}
            >
              Опубликовать анонс
            </button>
          )}
          {publish.error && <ErrorState error={publish.error} />}
        </details>
      )}
      <h2>Участники встречи</h2>
      <div className="toolbar">
        <SelectFilter
          label="Нужен пропуск"
          options={booleanOptions}
          value={list.params.get('needs_pass') || ''}
          onChange={(v) => list.set('needs_pass', v)}
        />
        <SelectFilter
          label="Регистрация"
          options={[
            ['', 'Все'],
            ['registered', 'Активная'],
            ['cancelled', 'Отменена'],
          ]}
          value={list.params.get('status') || ''}
          onChange={(v) => list.set('status', v)}
        />
      </div>
      <DataTable
        name={'Участники мероприятия'}
        columns={columns}
        list={list}
        onResetColumns={() => saveView({ compactStatus: false })}
        columnSettings={
          <fieldset>
            <legend>Сокращённый вид</legend>
            <label>
              <input
                type="checkbox"
                checked={view.compactStatus}
                onChange={(e) => saveView({ ...view, compactStatus: e.target.checked })}
              />
              Статус — только индикатор
            </label>
          </fieldset>
        }
      />
    </>
  )
}
