import type { ColumnDef } from '@tanstack/react-table'
import { ArrowUpRight } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { PageHeader, Status } from '../../../shared/components'
import { dateTime } from '../../../shared/format'
import { DataTable, useList } from '../../../shared/table'
import { personalStatuses, type MemberEvent } from './model'

export default function MemberEventsPage() {
  const location = useLocation()
  const view = new URLSearchParams(location.search).get('view') || 'upcoming'
  const list = useList<MemberEvent>(
    '/events',
    { sort: 'starts_at', order: view === 'all' ? 'desc' : 'asc' },
    ['view'],
    'member',
  )
  const columns: ColumnDef<MemberEvent, unknown>[] = [
    { accessorKey: 'id', header: 'ID' },
    {
      accessorKey: 'title',
      header: 'Мероприятие',
      enableHiding: false,
      cell: ({ row }) => (
        <Link
          className="row-link"
          to={'/events/' + row.original.id}
          state={{ from: location.pathname + location.search }}
        >
          <strong>{row.original.title}</strong>
          <ArrowUpRight size={16} />
        </Link>
      ),
    },
    {
      accessorKey: 'starts_at',
      header: 'Когда',
      cell: ({ row }) => dateTime(row.original.starts_at),
    },
    {
      accessorKey: 'status',
      header: 'Статус',
      cell: ({ row }) => <Status value={row.original.status} />,
    },
    {
      accessorKey: 'personal_status',
      header: 'Мой статус',
      cell: ({ row }) => <span className={'status-' + row.original.personal_status}>
        {personalStatuses[row.original.personal_status]}
      </span>,
    },
  ]
  return (
    <>
      <PageHeader title="Мероприятия" />
      <div className="tabs" aria-label="Список мероприятий">
        {[
          ['all', 'Все встречи'],
          ['upcoming', 'Предстоящие'],
          ['registered', 'Я зарегистрирован'],
        ].map(([key, label]) => (
          <button
            key={key}
            className={key === view ? 'selected' : ''}
            aria-pressed={key === view}
            onClick={() => list.set('view', key)}
          >
            {label}
          </button>
        ))}
      </div>
      <DataTable name="Мероприятия участника" columns={columns} list={list} />
      <p className="footnote">Время мероприятий указано по Москве.</p>
    </>
  )
}
