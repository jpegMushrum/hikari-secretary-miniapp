import { useEffect, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useLocation } from 'react-router-dom'
import type { ColumnDef } from '@tanstack/react-table'
import { api, type AISettings, type AIJob } from '../../shared/api'
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
