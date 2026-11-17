import { Link, useLocation } from 'react-router-dom'
import type { ColumnDef } from '@tanstack/react-table'
import type { Feedback } from '../../shared/api'
import { PageHeader, SelectFilter } from '../../shared/components'
import { DataTable, useList } from '../../shared/table'
import { dateTime } from '../../shared/format'
export default function FeedbackPage() {
  const location = useLocation()
  const list = useList<Feedback>('/feedback', { sort: 'created_at', order: 'desc' }, [
    'kind',
    'event_id',
    'author_id',
    'from',
    'to',
  ])
  const columns: ColumnDef<Feedback, unknown>[] = [
    {
      accessorKey: 'text',
      header: 'Отзыв',
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => (
        <Link
          className="feedback-preview"
          to={'/admin/feedback/' + row.original.id}
          state={{ from: location.pathname + location.search }}
        >
          {row.original.text}
        </Link>
      ),
    },
    {
      accessorKey: 'event_id',
      header: 'О чём',
      enableSorting: false,
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
      enableSorting: false,
    },
    { accessorKey: 'created_at', header: 'Дата', cell: (i) => dateTime(i.getValue() as string) },
  ]
  return (
    <>
      <PageHeader
        title="Отзывы"
        description="Что запомнилось участникам и что можно сделать лучше."
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
        <label className="filter">
          <span>ID мероприятия</span>
          <input
            aria-label="ID мероприятия"
            type="number"
            min={1}
            value={list.params.get('event_id') || ''}
            onChange={(e) => list.set('event_id', e.target.value)}
          />
        </label>
        <label className="filter">
          <span>ID участника</span>
          <input
            aria-label="ID участника"
            type="number"
            min={1}
            value={list.params.get('author_id') || ''}
            onChange={(e) => list.set('author_id', e.target.value)}
          />
        </label>
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
