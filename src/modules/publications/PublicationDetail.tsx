import { useState, type FormEvent } from 'react'
import { useParams, useLocation, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type Publication } from '../../shared/api'
import { BackLink, PageHeader, Loading, ErrorState, Status } from '../../shared/components'
import { PublicationPreview } from './PublicationPreview'
import { dateTime } from '../../shared/format'

const localTime = (raw: string) => {
  const date = new Date(new Date(raw).getTime() + 3 * 3600000)
  return date.toISOString().slice(0, 16)
}
export default function PublicationDetail() {
  const { id } = useParams(),
    location = useLocation()
  const query = useQuery({
    queryKey: ['publication', id],
    queryFn: ({ signal }) => api<Publication>('/publications/' + id, { signal }),
    refetchOnWindowFocus: false,
    refetchInterval: (q) => (q.state.data?.status === 'scheduled' ? 3000 : false),
  })
  if (query.isPending) return <Loading />
  if (query.error) return <ErrorState error={query.error} retry={() => void query.refetch()} />
  return (
    <>
      <BackLink to={location.state?.from || '/admin/events/drafts'}>Анонсы и черновики</BackLink>
      <PageHeader
        title={'Анонс #' + id}
        description="Текст и оформление подготовлены в Telegram."
        action={<Status value={query.data.status} />}
      />
      <div className="publication-workspace">
        <section>
          <h2>Предпросмотр</h2>
          <PublicationPreview publication={query.data} />
          <p className="footnote">
            Содержимое сохраняется в исходном формате. Отображение в Telegram может отличаться.
          </p>
        </section>
        <Settings key={query.data.id + ':' + query.data.status} publication={query.data} />
      </div>
    </>
  )
}

function Settings({ publication: p }: { publication: Publication }) {
  const client = useQueryClient()
  const targets = useQuery({
    queryKey: ['targets'],
    queryFn: ({ signal }) => api<{ key: string; name: string }[]>('/targets', { signal }),
  })
  const [selected, setSelected] = useState(p.deliveries.map((d) => d.target_key)),
    [event, setEvent] = useState(!!p.event)
  const [title, setTitle] = useState(p.event?.title || ''),
    [starts, setStarts] = useState(p.event ? localTime(p.event.starts_at) : ''),
    [ends, setEnds] = useState(p.event ? localTime(p.event.ends_at) : '')
  const [mode, setMode] = useState('draft'),
    [when, setWhen] = useState(''),
    [notice, setNotice] = useState(''),
    [confirmCancel, setConfirmCancel] = useState(false)
  const mutation = useMutation({
    mutationFn: async () => {
      setNotice('')
      const start = new Date(starts + ':00+03:00'),
        end = new Date(ends + ':00+03:00')
      if (event && (!title.trim() || !starts || !ends || start <= new Date() || end <= start))
        throw new Error('Укажите название, будущее начало и окончание позже начала.')
      if (mode !== 'draft' && !selected.length)
        throw new Error('Выберите хотя бы одно место публикации.')
      const planned = mode === 'later' ? new Date(when + ':00+03:00') : new Date()
      if (mode === 'later' && (!when || planned <= new Date()))
        throw new Error('Выберите будущее время публикации.')
      if (mode !== 'draft' && event && planned >= start)
        throw new Error('Анонс должен выйти раньше начала мероприятия.')
      await api('/publications/' + p.id + '/settings', {
        method: 'PUT',
        body: JSON.stringify({
          target_keys: selected,
          ...(event
            ? {
                event: {
                  title: title.trim(),
                  starts_at: starts + ':00+03:00',
                  ends_at: ends + ':00+03:00',
                },
              }
            : {}),
        }),
      })
      if (mode !== 'draft') {
        setNotice('Настройки сохранены. Ставим публикацию в очередь…')
        try {
          await api('/publications/' + p.id + '/schedule', {
            method: 'POST',
            body: JSON.stringify(mode === 'later' ? { scheduled_at: when + ':00+03:00' } : {}),
          })
        } catch (error) {
          setNotice(
            'Настройки сохранены. Не удалось подтвердить постановку в очередь — проверьте статус публикации.',
          )
          throw error
        }
      }
    },
    onSuccess: () => {
      setNotice(mode === 'draft' ? 'Настройки сохранены' : 'Публикация поставлена в очередь')
      void client.invalidateQueries()
    },
    onError: () => {
      void client.invalidateQueries({ queryKey: ['publication'] })
    },
  })
  const cancel = useMutation({
    mutationFn: () => api('/publications/' + p.id + '/cancel', { method: 'POST' }),
    onSuccess: () => {
      setConfirmCancel(false)
      void client.invalidateQueries()
    },
  })
  function submit(e: FormEvent) {
    e.preventDefault()
    mutation.mutate()
  }
  if (p.status !== 'draft')
    return (
      <section className="publication-dispatch">
        <h2>Отправка</h2>
        <p>
          <Status value={p.status} />
        </p>
        <p>{dateTime(p.scheduled_at)}</p>
        {p.deliveries.map((d) => (
          <p key={d.target_key}>
            {d.target_name}{' '}
            <span className="inline-status">
              <Status value={d.status} />
            </span>
            {d.last_error && <span className="muted"> — {d.last_error}</span>}
          </p>
        ))}
        {p.status === 'scheduled' && (
          <>
            <button className="button secondary" onClick={() => setConfirmCancel(true)}>
              Отменить публикацию
            </button>
            {confirmCancel && (
              <div className="notice">
                <p>
                  Отменить отправку анонса? Само мероприятие останется доступным в списке
                  мероприятий.
                </p>
                <button
                  className="button primary"
                  disabled={cancel.isPending}
                  onClick={() => cancel.mutate()}
                >
                  Подтвердить отмену
                </button>
                <button className="text-button" onClick={() => setConfirmCancel(false)}>
                  Оставить
                </button>
              </div>
            )}
          </>
        )}
        {cancel.error && <ErrorState error={cancel.error} />}
        <Link className="text-link" to="/admin/events">
          К мероприятиям →
        </Link>
      </section>
    )
  return (
    <form className="editor-form" onSubmit={submit}>
      <h2>Настройки</h2>
      <fieldset disabled={mutation.isPending} className="settings-fields">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={event}
            disabled={!!p.event}
            onChange={(e) => setEvent(e.target.checked)}
          />
          Регистрация на мероприятие
        </label>
        {event && (
          <>
            <label>
              Название мероприятия
              <input
                required
                maxLength={160}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <label>
              Начало · Москва
              <input
                required
                type="datetime-local"
                value={starts}
                onChange={(e) => setStarts(e.target.value)}
              />
            </label>
            <label>
              Окончание · Москва
              <input
                required
                type="datetime-local"
                value={ends}
                onChange={(e) => setEnds(e.target.value)}
              />
            </label>
          </>
        )}
        <fieldset>
          <legend>Где опубликовать</legend>
          {targets.data?.map((t) => (
            <label className="checkbox-label" key={t.key}>
              <input
                type="checkbox"
                checked={selected.includes(t.key)}
                onChange={(e) =>
                  setSelected((current) =>
                    e.target.checked ? [...current, t.key] : current.filter((k) => k !== t.key),
                  )
                }
              />
              {t.name}
            </label>
          ))}
          {targets.error && (
            <ErrorState error={targets.error} retry={() => void targets.refetch()} />
          )}
        </fieldset>
        <label>
          Когда опубликовать
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="draft">Пока сохранить черновик</option>
            <option value="now">Сразу после подтверждения</option>
            <option value="later">В выбранное время</option>
          </select>
        </label>
        {mode === 'later' && (
          <label>
            Публикация · Москва
            <input
              required
              type="datetime-local"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
            />
          </label>
        )}
        <button
          className="button primary"
          disabled={mutation.isPending || targets.isPending || !!targets.error}
        >
          {mutation.isPending
            ? 'Сохраняем…'
            : mode === 'draft'
              ? 'Сохранить настройки'
              : mode === 'now'
                ? 'Подтвердить публикацию'
                : 'Запланировать'}
        </button>
      </fieldset>
      {notice && (
        <p role="status" className="muted">
          {notice}
        </p>
      )}
      {mutation.error && <ErrorState error={mutation.error} />}
      <p className="footnote">
        Чтобы настроить этот черновик в Telegram, нажмите «Остаться в чате» под сообщением бота.
      </p>
    </form>
  )
}
