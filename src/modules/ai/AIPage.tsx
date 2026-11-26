import { useEffect, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useLocation } from 'react-router-dom'
import type { ColumnDef } from '@tanstack/react-table'
import { api, ApiError, type AISettings, type AIJob } from '../../shared/api'
import { PageHeader, ErrorState, Loading, SelectFilter } from '../../shared/components'
import { DataTable, useList } from '../../shared/table'
import { dateTime } from '../../shared/format'
import { GenerationStatus, PublicationStatus, topicTitle } from './AIJobStatus'
import { AutomationControls } from './AutomationControls'

export default function AIPage() {
  const location = useLocation()
  const client = useQueryClient()
  const settings = useQuery({
    queryKey: ['ai-settings'],
    queryFn: ({ signal }) => api<AISettings>('/ai/settings', { signal }),
  })
  const [level, setLevel] = useState('N3'),
    [comment, setComment] = useState(''),
    [saved, setSaved] = useState(false)
  useEffect(() => {
    if (settings.data) {
      setLevel(settings.data.jlpt_level)
      setComment(settings.data.admin_comment || '')
    }
  }, [settings.data])
  const save = useMutation({
    mutationFn: () =>
      api('/ai/settings', {
        method: 'PUT',
        body: JSON.stringify({ jlpt_level: level, admin_comment: comment || null }),
      }),
    onSuccess: () => {
      setSaved(true)
      void client.invalidateQueries({ queryKey: ['ai-settings'] })
    },
  })
  const list = useList<AIJob>('/ai/history', { sort: 'scheduled_for', order: 'desc' }, ['status'])
  const columns: ColumnDef<AIJob, unknown>[] = [
    { accessorKey: 'id', header: 'ID' },
    {
      id: 'title',
      header: 'Тема',
      enableHiding: false,
      accessorFn: topicTitle,
      cell: ({ row }) => (
        <Link
          className="text-link"
          to={'/admin/ai/history/' + row.original.id}
          state={{ from: location.pathname + location.search }}
        >
          {topicTitle(row.original)}
        </Link>
      ),
    },
    { accessorKey: 'scheduled_for', header: 'Дата', cell: (i) => dateTime(i.getValue() as string) },
    {
      accessorKey: 'status',
      header: 'Генерация',
      cell: ({ row }) => <GenerationStatus job={row.original} />,
    },
    {
      accessorKey: 'publication_status',
      header: 'Публикация',
      cell: ({ row }) => <PublicationStatus job={row.original} />,
    },
    { accessorKey: 'attempts', header: 'Попытки' },
    { accessorKey: 'version_count', header: 'Версий', enableSorting: false },
  ]
  function submit(e: FormEvent) {
    e.preventDefault()
    setSaved(false)
    save.mutate()
  }
  return (
    <>
      <PageHeader title="ИИ" />
      {settings.isPending ? (
        <Loading />
      ) : settings.error ? (
        <ErrorState error={settings.error} retry={() => void settings.refetch()} />
      ) : (
        <form className="ai-settings" onSubmit={submit}>
          <div className="section-heading">
            <h2>Подготовка материалов</h2>
            <span className={settings.data.enabled ? 'status-positive' : 'muted'}>
              {settings.data.enabled ? 'Генератор подключён' : 'Генератор не подключён'}
            </span>
          </div>
          <div className="form-grid">
            <label>
              Уровень японского
              <select
                value={level}
                onChange={(e) => {
                  setLevel(e.target.value)
                  setSaved(false)
                }}
              >
                {['N5', 'N4', 'N3', 'N2', 'N1'].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </label>
            <label>
              Пожелания к темам
              <input
                maxLength={500}
                value={comment}
                onChange={(e) => {
                  setComment(e.target.value)
                  setSaved(false)
                }}
                placeholder="Например, повседневная жизнь и путешествия"
              />
            </label>
          </div>
          <div className="button-row">
            <button className="button secondary" disabled={save.isPending}>
              {save.isPending ? 'Сохраняем…' : 'Сохранить настройки'}
            </button>
            {saved && (
              <span role="status" className="muted">
                Настройки сохранены
              </span>
            )}
          </div>
          {save.error && <ErrorState error={save.error} />}
        </form>
      )}
      <div className="ai-actions">
        <QueueGeneration enabled={settings.data?.enabled && !save.isPending} />
        <AutomationControls />
      </div>
      <div className="section-heading">
        <h2>История тем</h2>
        <SelectFilter
          label="Статус генерации"
          options={[
            ['', 'Все'],
            ['scheduled', 'Подготовлено'],
            ['failed', 'Ошибка'],
            ['pending', 'Ожидает'],
            ['generating', 'Генерируется'],
            ['retry', 'Повтор'],
            ['cancelled', 'Отменено'],
          ]}
          value={list.params.get('status') || ''}
          onChange={(v) => list.set('status', v)}
        />
      </div>
      <DataTable name="История тем" columns={columns} list={list} />
    </>
  )
}

function isGenerating(job: AIJob | null | undefined) {
  return job != null && ['pending', 'generating', 'retry'].includes(job.status)
}

function useRefreshJobViews(job: AIJob | null | undefined) {
  const client = useQueryClient()
  useEffect(() => {
    if (!job) return
    void client.invalidateQueries({ queryKey: ['/ai/automation'] })
    void client.invalidateQueries({ queryKey: ['ai-job', String(job.id)] })
    void client.invalidateQueries({ queryKey: ['/ai/history'] })
    if (job.publication_id != null) {
      void client.invalidateQueries({ queryKey: ['publication', String(job.publication_id)] })
      void client.invalidateQueries({ queryKey: ['/publications'] })
      void client.invalidateQueries({ queryKey: ['/event-workspace'] })
    }
  }, [client, job])
}

function QueueGeneration({ enabled }: { enabled?: boolean }) {
  const client = useQueryClient()
  const latest = useQuery({
    queryKey: ['ai-latest'],
    queryFn: async ({ signal }) =>
      (await api<AIJob | undefined>('/ai/history/latest', { signal })) ?? null,
    refetchInterval: ({ state }) => (isGenerating(state.data) ? 3000 : 15000),
  })
  const job = latest.data
  const enqueue = useMutation({
    mutationFn: () => api<{ job_id: number }>('/ai/generations/queue', { method: 'POST' }),
    onSettled: () => client.invalidateQueries({ queryKey: ['ai-latest'] }),
  })
  const acceptedId = enqueue.data?.job_id
  const tracked = useQuery({
    queryKey: ['ai-queued', acceptedId, enqueue.submittedAt],
    queryFn: ({ signal }) => api<AIJob>('/ai/history/' + acceptedId, { signal }),
    enabled: acceptedId != null,
    refetchInterval: ({ state }) => (isGenerating(state.data) ? 3000 : false),
  })
  useRefreshJobViews(job)
  useRefreshJobViews(tracked.data)

  const waiting = acceptedId != null && (tracked.isPending || isGenerating(tracked.data))
  const lastError = (tracked.data ?? job)?.last_error

  let status = ''
  if (enqueue.isPending) status = 'Запускаем генерацию…'
  else if (waiting) status = 'Генерация выполняется.'
  else if (tracked.data?.publication_status === 'scheduled' && tracked.data.status === 'scheduled')
    status = 'Новый материал поставлен в очередь.'
  else if (isGenerating(job)) status = 'Генерация выполняется.'

  let error = enqueue.error
  if (error instanceof ApiError && error.code === 'ai_disabled')
    error = new Error('Генератор не подключён.')
  if (error instanceof ApiError && error.code === 'invalid_state')
    error = new Error('Состояние очереди изменилось. Попробуйте ещё раз.')
  return (
    <>
      <button
        type="button"
        className="button secondary"
        disabled={!enabled || enqueue.isPending || waiting}
        onClick={() => enqueue.mutate()}
      >
        Поставить новую генерацию в очередь
      </button>
      {status && <span className="muted" role="status">{status}</span>}
      {latest.error && <ErrorState error={latest.error} retry={() => void latest.refetch()} />}
      {acceptedId != null && tracked.error && (
        <ErrorState error={tracked.error} retry={() => void tracked.refetch()} />
      )}
      {error && <ErrorState error={error} />}
      {lastError && <p className="notice error">{lastError}</p>}
    </>
  )
}
