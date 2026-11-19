import { useEffect, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { api, type AISettings, type AIJob } from '../../shared/api'
import { PageHeader, ErrorState, Loading, Status, SelectFilter } from '../../shared/components'
import { DataTable, useList } from '../../shared/table'
import { dateTime } from '../../shared/format'
export default function AIPage() {
  const client = useQueryClient()
  const settings = useQuery({
    queryKey: ['ai-settings'],
    queryFn: ({ signal }) => api<AISettings>('/ai/settings', { signal }),
  })
  const [level, setLevel] = useState('N3'),
    [comment, setComment] = useState(''),
    [saved, setSaved] = useState(false),
    [detail, setDetail] = useState<AIJob | null>(null)
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
  const title = (job: AIJob) => {
    const t = job.topic
    return String(t?.title_ru || t?.title || t?.theme || t?.topic || 'Материал #' + job.id)
  }
  const columns: ColumnDef<AIJob, unknown>[] = [
    { accessorKey: 'id', header: 'ID', enableSorting: false },
    {
      id: 'title',
      header: 'Тема',
      enableSorting: false,
      enableHiding: false,
      accessorFn: title,
      cell: ({ row }) => (
        <button className="text-link" onClick={() => setDetail(row.original)}>
          {title(row.original)}
        </button>
      ),
    },
    { accessorKey: 'scheduled_for', header: 'Дата', cell: (i) => dateTime(i.getValue() as string) },
    {
      accessorKey: 'status',
      header: 'Статус',
      enableSorting: false,
      cell: (i) => (
        <Status
          value={i.getValue() as string}
          label={i.getValue() === 'scheduled' ? 'Подготовлено' : undefined}
        />
      ),
    },
    { accessorKey: 'attempts', header: 'Попытки', enableSorting: false },
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
          label="Статус"
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
      {detail && (
        <section className="topic-detail">
          <div className="section-heading">
            <h2>{title(detail)}</h2>
            <button className="text-button" onClick={() => setDetail(null)}>
              Закрыть
            </button>
          </div>
          {detail.last_error && <p className="notice error">{detail.last_error}</p>}
          <Topic value={detail.topic} />
        </section>
      )}
    </>
  )
}
function Topic({ value }: { value: unknown }) {
  if (value == null) return <p className="muted">Материал ещё не сформирован.</p>
  if (typeof value === 'string' || typeof value === 'number')
    return <p className="prose">{String(value)}</p>
  if (Array.isArray(value))
    return (
      <ul className="topic-list">
        {value.map((v, i) => (
          <li key={i}>
            <Topic value={v} />
          </li>
        ))}
      </ul>
    )
  if (typeof value === 'object')
    return (
      <dl className="topic-fields">
        {Object.entries(value).map(([k, v]) => (
          <div key={k}>
            <dt>
              {(
                {
                  title: 'Тема',
                  title_ru: 'Тема',
                  questions: 'Вопросы',
                  vocabulary: 'Лексика',
                  grammar: 'Грамматика',
                  vocabulary_theme: 'Тема лексики',
                  introduction: 'Вступление',
                  japanese: 'Японский',
                  reading: 'Чтение',
                  pattern: 'Конструкция',
                  explanation: 'Объяснение',
                  example: 'Пример',
                  jlpt_level: 'Уровень',
                  translation: 'Перевод',
                  text: 'Текст',
                } as Record<string, string>
              )[k] || k}
            </dt>
            <dd>
              <Topic value={v} />
            </dd>
          </div>
        ))}
      </dl>
    )
  return null
}
