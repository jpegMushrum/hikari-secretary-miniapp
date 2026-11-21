import { useEffect, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useLocation } from 'react-router-dom'
import type { ColumnDef } from '@tanstack/react-table'
import { api, ApiError, type AISettings, type AIJob } from '../../shared/api'
import { PageHeader, ErrorState, Loading, SelectFilter } from '../../shared/components'
import { DataTable, useList } from '../../shared/table'
import { dateTime } from '../../shared/format'
import { GenerationStatus, PublicationStatus, topicTitle } from './AIJobStatus'

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
            <span className="muted">
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
      <LatestGeneration enabled={settings.data?.enabled} />
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
    void client.invalidateQueries({ queryKey: ['ai-job', String(job.id)] })
    void client.invalidateQueries({ queryKey: ['/ai/history'] })
    if (job.publication_id != null) {
      void client.invalidateQueries({ queryKey: ['publication', String(job.publication_id)] })
      void client.invalidateQueries({ queryKey: ['/publications'] })
      void client.invalidateQueries({ queryKey: ['/event-workspace'] })
    }
  }, [client, job])
}

function LatestGeneration({ enabled }: { enabled?: boolean }) {
  const client = useQueryClient()
  const latest = useQuery({
    queryKey: ['ai-latest'],
    queryFn: async ({ signal }) =>
      (await api<AIJob | undefined>('/ai/history/latest', { signal })) ?? null,
    refetchInterval: ({ state }) => (isGenerating(state.data) ? 3000 : 15000),
  })
  const job = latest.data
  const regenerate = useMutation({
    mutationFn: () => api<{ id: number }>('/ai/history/latest/regenerate', { method: 'POST' }),
    onSettled: () => client.invalidateQueries({ queryKey: ['ai-latest'] }),
  })
  const acceptedId = regenerate.data?.id
  const trackSeparately = acceptedId != null && acceptedId !== job?.id
  const tracked = useQuery({
    queryKey: ['ai-replacement', acceptedId, regenerate.submittedAt],
    queryFn: ({ signal }) => api<AIJob>('/ai/history/' + acceptedId, { signal }),
    enabled: trackSeparately,
    refetchInterval: ({ state }) => (isGenerating(state.data) ? 3000 : false),
  })
  const replacement = trackSeparately ? tracked.data : acceptedId != null ? job : null
  useRefreshJobViews(job)
  useRefreshJobViews(trackSeparately ? tracked.data : null)

  const waitingForReplacement = (trackSeparately && tracked.isPending) || isGenerating(replacement)
  const lastError = (replacement ?? job)?.last_error

  let status = ''
  if (regenerate.isPending) status = 'Запускаем генерацию…'
  else if (waitingForReplacement) status = 'Генерация выполняется.'
  else if (trackSeparately && replacement?.status === 'scheduled')
    status = 'Новый материал поставлен в очередь.'
  else if (latest.isPending) status = 'Проверяем последнее задание…'
  else if (enabled === false) status = 'Для замены подключите генератор.'
  else if (!latest.error && !job) status = 'Заданий ИИ пока нет.'
  else if (isGenerating(job)) status = 'Генерация выполняется.'
  else if (job && !job.can_regenerate) status = 'Последнюю генерацию уже нельзя заменить.'
  else if (replacement?.status === 'scheduled') status = 'Новый материал поставлен в очередь.'

  let error = regenerate.error
  if (error instanceof ApiError && error.code === 'ai_disabled')
    error = new Error('Генератор не подключён.')
  if (error instanceof ApiError && error.code === 'invalid_state')
    error = new Error('Состояние задания изменилось. Замена сейчас недоступна.')
  return (
    <>
      <div className="button-row">
        <button
          type="button"
          className="button secondary"
          disabled={
            !job?.can_regenerate || !!latest.error || regenerate.isPending || waitingForReplacement
          }
          onClick={() => regenerate.mutate()}
        >
          Заменить последнюю генерацию
        </button>
        <span className="muted" role="status">
          {status}
        </span>
      </div>
      {latest.error && <ErrorState error={latest.error} retry={() => void latest.refetch()} />}
      {trackSeparately && tracked.error && (
        <ErrorState error={tracked.error} retry={() => void tracked.refetch()} />
      )}
      {error && <ErrorState error={error} />}
      {lastError && <p className="notice error">{lastError}</p>}
    </>
  )
}
