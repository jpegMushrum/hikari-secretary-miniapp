import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type Publication, type Repost } from '../../shared/api'
import { dateTime, moscowInput } from '../../shared/format'
import { ErrorState, Loading, Status } from '../../shared/components'

type Target = { key: string; name: string }
export type PlannedForward = { target_key: string; when: string }
const labels: Record<string, string> = {
  pending: 'Запланировано',
  publishing: 'Отправляется',
  sent: 'Опубликовано',
  needs_decision: 'Требует решения',
  cancelled: 'Отменено',
  retry: 'Повтор отправки',
}

function wireTime(input: string) {
  return input ? input + ':00+03:00' : null
}

export function plannedPayload(items: PlannedForward[], originalTime?: Date) {
  return items.map(({ target_key, when }) => {
    if (!target_key) throw new Error('Выберите чат для каждого репоста.')
    const scheduled_at = wireTime(when)
    if (scheduled_at) {
      const time = new Date(scheduled_at).getTime()
      if (!Number.isFinite(time) || time <= Date.now())
        throw new Error('Укажите будущее время репоста.')
      if (originalTime && time < originalTime.getTime())
        throw new Error('Репост должен выйти после оригинала.')
    }
    return { target_key, scheduled_at }
  })
}

function Destination({
  targets,
  value,
  set,
}: {
  targets: Target[]
  value: string
  set: (v: string) => void
}) {
  return (
    <label>
      Куда переслать
      <select required value={value} onChange={(e) => set(e.target.value)}>
        <option value="">Выберите чат</option>
        {targets.map((t) => (
          <option key={t.key} value={t.key}>
            {t.name}
          </option>
        ))}
      </select>
    </label>
  )
}

function TimeChoice({
  when,
  set,
  published,
}: {
  when: string
  set: (s: string) => void
  published?: boolean
}) {
  const [later, setLater] = useState(!!when)
  return (
    <>
      <label>
        Когда переслать
        <select
          value={later ? 'later' : 'auto'}
          onChange={(e) => {
            const next = e.target.value === 'later'
            setLater(next)
            if (!next) set('')
          }}
        >
          <option value="auto">{published ? 'Сейчас' : 'Сразу после оригинала'}</option>
          <option value="later">В выбранное время</option>
        </select>
      </label>
      {later && (
        <label>
          Время репоста · Москва
          <input
            type="datetime-local"
            required
            value={when}
            onChange={(e) => set(e.target.value)}
          />
        </label>
      )}
    </>
  )
}

export type DraftForwardRow = PlannedForward & { key: string }

export function DraftForwards({
  items,
  set,
  targets,
}: {
  items: DraftForwardRow[]
  set: (v: DraftForwardRow[]) => void
  targets: Target[]
}) {
  function edit(key: string, changes: Partial<PlannedForward>) {
    set(items.map((row) => (row.key === key ? { ...row, ...changes } : row)))
  }
  return (
    <>
      {items.map((row) => (
        <fieldset className="settings-fields" key={row.key}>
          <legend>Репост</legend>
          <Destination
            targets={targets}
            value={row.target_key}
            set={(key) => edit(row.key, { target_key: key })}
          />
          <TimeChoice when={row.when} set={(when) => edit(row.key, { when })} />
          <button
            type="button"
            className="text-link"
            onClick={() => set(items.filter((i) => i.key !== row.key))}
          >
            Убрать репост
          </button>
        </fieldset>
      ))}
      <button
        type="button"
        className="button secondary"
        onClick={() => set([...items, { key: crypto.randomUUID(), target_key: '', when: '' }])}
      >
        Добавить репост
      </button>
    </>
  )
}

export function DeliverySummary({
  item,
  time,
  originalUrl,
  fallback = '—',
}: {
  item: Pick<Repost, 'target_name' | 'status' | 'last_error'>
  time?: string | null
  originalUrl?: string | null
  fallback?: string
}) {
  return (
    <div className="delivery-summary">
      <p>{time ? dateTime(time) : fallback}</p>
      <p className="delivery-line">
        {item.target_name}
        <Status value={item.status} label={labels[item.status]} />
        {item.status === 'sent' && originalUrl && (
          <a className="text-link" href={originalUrl} target="_blank" rel="noreferrer">
            Открыть оригинал ↗
          </a>
        )}
      </p>
      {item.last_error && <p className="muted">{item.last_error}</p>}
    </div>
  )
}

function RepostForm({
  publication,
  item,
  close,
}: {
  publication: Publication
  item: Repost
  close: () => void
}) {
  const sources = publication.deliveries.filter(
    (d) => d.id && (d.can_forward || d.id === item.source_delivery_id),
  )
  const [source, setSource] = useState(item.source_delivery_id)
  const [when, setWhen] = useState(moscowInput(item.scheduled_at))
  const client = useQueryClient()
  const mutation = useMutation({
    mutationFn: async (action: 'cancel' | 'schedule') => {
      const path = '/publications/' + publication.id + '/reposts/' + item.id
      if (action === 'cancel') return api(path, { method: 'PUT', body: JSON.stringify({ action }) })
      if (!source) throw new Error('Выберите исходное сообщение.')
      const [{ scheduled_at }] = plannedPayload([{ target_key: item.target_key, when }])
      await api(path, {
        method: 'PUT',
        body: JSON.stringify({ action, source_delivery_id: source, scheduled_at }),
      })
    },
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['publication'] }),
        client.invalidateQueries({ queryKey: ['reposts'] }),
      ])
      close()
    },
  })
  function submit(e: FormEvent) {
    e.preventDefault()
    mutation.mutate('schedule')
  }
  return (
    <form className="editor-form" onSubmit={submit}>
      <fieldset className="settings-fields" disabled={mutation.isPending}>
        <legend>Изменить репост</legend>
        <label>
          Исходное сообщение
          <select required value={source ?? ''} onChange={(e) => setSource(Number(e.target.value))}>
            {sources.map((d) => (
              <option value={d.id} key={d.id}>
                {d.target_name}
              </option>
            ))}
          </select>
        </label>
        <p>{item.target_name}</p>
        <TimeChoice
          when={when}
          set={setWhen}
          published={sources.some((d) => d.id === source && d.can_forward)}
        />
        <div className="button-row">
          <button className="button primary" disabled={!source}>
            Сохранить
          </button>
          <button
            className="button secondary"
            type="button"
            onClick={() => mutation.mutate('cancel')}
          >
            Отменить репост
          </button>
          <button type="button" className="text-link" onClick={close}>
            Закрыть
          </button>
        </div>
      </fieldset>
      {mutation.error && <ErrorState error={mutation.error} />}
    </form>
  )
}

export function PublicationReposts({ publication }: { publication: Publication }) {
  const [edit, setEdit] = useState<number | null>(null)
  const items = publication.reposts ?? []
  const allowed = publication.status !== 'cancelled' && publication.event?.status !== 'cancelled'
  if (!items.length) return null
  return (
    <section className="publication-reposts">
      <h2>Репосты</h2>
      {items.map((item) => (
        <div key={item.id} className="repost-row">
          <DeliverySummary
            item={item}
            time={item.sent_at ?? item.scheduled_at ?? publication.scheduled_at}
            originalUrl={publication.deliveries.find((d) => d.id === item.source_delivery_id)?.url}
            fallback="После оригинала"
          />
          {allowed &&
            ['needs_decision', 'retry', 'pending'].includes(item.status) &&
            (edit === item.id ? (
              <RepostForm item={item} publication={publication} close={() => setEdit(null)} />
            ) : (
              <button type="button" className="button secondary" onClick={() => setEdit(item.id)}>
                Изменить репост
              </button>
            ))}
        </div>
      ))}
    </section>
  )
}

type QueueItem = Repost & { publication_id: number; title: string }

export function RepostQueue() {
  const queue = useQuery({
    queryKey: ['reposts'],
    queryFn: ({ signal }) => api<{ items: QueueItem[] }>('/publications/reposts', { signal }),
    refetchInterval: 15000,
  })
  if (queue.isPending) return <Loading />
  if (queue.error) return <ErrorState error={queue.error} retry={() => void queue.refetch()} />
  return (
    <section aria-label="Очередь репостов">
      {queue.data.items.length === 0 && <p>Запланированных репостов нет.</p>}
      {queue.data.items.map((item) => (
        <div className="repost-row" key={item.id}>
          <Link className="text-link" to={'/admin/publications/' + item.publication_id}>
            {item.title || 'Анонс №' + item.publication_id}
          </Link>
          <DeliverySummary
            item={item}
            time={item.sent_at ?? item.scheduled_at}
            fallback="После оригинала"
          />
        </div>
      ))}
    </section>
  )
}
