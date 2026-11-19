import { Link, useLocation } from 'react-router-dom'
import { Plus, ArrowUpRight } from 'lucide-react'
import type { ColumnDef } from '@tanstack/react-table'
import type { ClubEvent } from '../../shared/api'
import { PageHeader, SearchInput, SelectFilter, Status } from '../../shared/components'
import { DataTable, useList } from '../../shared/table'
import { dateTime } from '../../shared/format'

type WorkspaceItem = Omit<ClubEvent, 'starts_at' | 'ends_at' | 'status'> & {
  kind: 'event' | 'draft'
  starts_at: string | null
  ends_at: string | null
  status: ClubEvent['status'] | 'draft'
}

export default function EventsPage() {
  const location = useLocation()
  const list = useList<WorkspaceItem>('/event-workspace', { sort: 'starts_at', order: 'desc' }, [
    'search',
    'status',
    'starts_from',
    'starts_to',
  ])
  const columns: ColumnDef<WorkspaceItem, unknown>[] = [
    { accessorKey: 'id', header: 'ID' },
    {
      accessorKey: 'title',
      header: 'Мероприятие',
      enableHiding: false,
      cell: ({ row }) => (
        <Link
          className="row-link"
          to={
            row.original.kind === 'draft'
              ? '/admin/publications/' + row.original.publication_id
              : '/admin/events/' + row.original.id
          }
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
      cell: (i) => (i.getValue() ? dateTime(i.getValue() as string) : 'Не задана'),
    },
    {
      accessorKey: 'status',
      header: 'Статус',
      cell: (i) => <Status value={i.getValue() as string} />,
    },
    {
      accessorKey: 'registrations',
      header: 'Регистрации',
      cell: (i) => <span className="number">{String(i.getValue())}</span>,
    },
    {
      accessorKey: 'attended',
      header: 'Посетили',
      cell: ({ row }) =>
        row.original.status === 'active' || row.original.kind === 'draft' ? (
          <span className="muted">—</span>
        ) : (
          row.original.attended
        ),
    },
  ]
  return (
    <>
      <PageHeader
        title="Мероприятия"
        action={
          <Link className="button primary" to="/admin/events/new">
            <Plus size={18} />
            Создать мероприятие
          </Link>
        }
      />
      <div className="tabs" aria-label="Статус мероприятия">
        {[
          ['', 'Все встречи'],
          ['active', 'Предстоящие'],
          ['completed', 'Прошедшие'],
          ['draft', 'Черновики'],
        ].map(([key, label]) => (
          <button
            key={key}
            className={(list.params.get('status') || '') === key ? 'selected' : ''}
            onClick={() => list.set('status', key)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="toolbar">
        <SearchInput
          placeholder="Название или ID мероприятия"
          value={list.params.get('search') || ''}
          onChange={(v) => list.set('search', v)}
        />
        <label className="filter">
          <span>Начало с</span>
          <input
            aria-label="Начало периода"
            type="date"
            value={(list.params.get('starts_from') || '').slice(0, 10)}
            onChange={(e) =>
              list.set('starts_from', e.target.value ? e.target.value + 'T00:00:00+03:00' : '')
            }
          />
        </label>
        <label className="filter">
          <span>До (не включая)</span>
          <input
            aria-label="Конец периода"
            type="date"
            value={(list.params.get('starts_to') || '').slice(0, 10)}
            onChange={(e) =>
              list.set('starts_to', e.target.value ? e.target.value + 'T00:00:00+03:00' : '')
            }
          />
        </label>
        <button className="text-button" onClick={list.reset}>
          Сбросить
        </button>
      </div>
      <SelectFilter
        label="Статус встречи"
        value={list.params.get('status') || ''}
        onChange={(v) => list.set('status', v)}
        options={[
          ['', 'Все'],
          ['active', 'Предстоящие'],
          ['completed', 'Прошедшие'],
          ['draft', 'Черновики'],
          ['cancelled', 'Отменённые'],
        ]}
      />
      <DataTable name="Мероприятия" columns={columns} list={list} />
      <Link className="text-link" to="/admin/events/drafts">
        Все анонсы и черновики →
      </Link>
      <p className="footnote">Время мероприятий указано по Москве.</p>
    </>
  )
}
