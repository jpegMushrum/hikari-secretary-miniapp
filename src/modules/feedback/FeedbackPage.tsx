import { Link, useLocation } from 'react-router-dom'
import type { ColumnDef } from '@tanstack/react-table'
import type { Feedback } from '../../shared/api'
import { PageHeader, SearchInput, SelectFilter } from '../../shared/components'
import { DataTable, useList } from '../../shared/table'
import { dateTime } from '../../shared/format'
import { TelegramMentions } from '../../shared/TelegramLink'
import './feedback-preview.css'
export default function FeedbackPage() {
  const location = useLocation()
  const params = new URLSearchParams(location.search)
  const scopedIds = ['event_id', 'author_id'].filter((key) =>
    /^\+?0*[1-9]\d*$/.test(params.get(key) || ''),
  )
  const list = useList<Feedback>('/feedback', { sort: 'created_at', order: 'desc' }, [
    'kind',
    'search',
    ...scopedIds,
    'from',
    'to',
  ])
  const columns: ColumnDef<Feedback, unknown>[] = [
    { accessorKey: 'id', header: 'ID' },
    {
      accessorKey: 'text',
      header: 'Отзыв',
      enableHiding: false,
      cell: ({ row }) => (
        <div className="feedback-preview-cell">
          <span className="feedback-preview">
            <TelegramMentions text={row.original.text} />
          </span>
          <Link
            className="feedback-open"
            aria-label={'Открыть отзыв №' + row.original.id}
            to={'/admin/feedback/' + row.original.id}
            state={{ from: location.pathname + location.search }}
          >
            →
          </Link>
        </div>
      ),
    },
    {
      accessorKey: 'event_id',
      meta: { sortField: 'event_title' },
      header: 'О чём',
      cell: ({ row }) =>
        row.original.event_id ? (
          <Link className="text-link" to={'/admin/events/' + row.original.event_id}>
            {row.original.event_title || 'Мероприятие #' + row.original.event_id}
          </Link>
        ) : (
          <span className="muted">О клубе в целом</span>
        ),
    },
    {
      accessorKey: 'author_name',
      header: 'Участник',
      cell: ({ row }) => <TelegramMentions text={row.original.author_name} />,
    },
    { accessorKey: 'created_at', header: 'Дата', cell: (i) => dateTime(i.getValue() as string) },
  ]
  return (
    <>
      <PageHeader
        title="Отзывы"
        description="После посещения бот спросил: «Хотите оставить обратную связь?»"
      />
      <div className="toolbar">
        <SelectFilter
          label="Тип отзыва"
          value={list.params.get('kind') || ''}
          onChange={(v) => list.set('kind', v)}
          options={[
            ['', 'Все отзывы'],
            ['event', 'О мероприятии'],
            ['general', 'О клубе'],
          ]}
        />
        <SearchInput
          placeholder="Мероприятие, участник или ID"
          value={list.params.get('search') || ''}
          onChange={(value) => list.set('search', value)}
        />
        {scopedIds.map((key) => (
          <span className="muted" key={key}>
            {key === 'event_id' ? 'Мероприятие' : 'Участник'} #{params.get(key)}
          </span>
        ))}
        <button className="text-button" onClick={list.reset}>
          Сбросить
        </button>
      </div>
      <div className="toolbar">
        <label className="filter">
          <span>Отзывы с</span>
          <input
            type="date"
            value={(list.params.get('from') || '').slice(0, 10)}
            onChange={(e) =>
              list.set('from', e.target.value ? e.target.value + 'T00:00:00+03:00' : '')
            }
          />
        </label>
        <label className="filter">
          <span>До (не включая)</span>
          <input
            type="date"
            value={(list.params.get('to') || '').slice(0, 10)}
            onChange={(e) =>
              list.set('to', e.target.value ? e.target.value + 'T00:00:00+03:00' : '')
            }
          />
        </label>
      </div>
      <DataTable name="Отзывы" columns={columns} list={list} />
    </>
  )
}
