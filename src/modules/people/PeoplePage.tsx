import type { ColumnDef } from '@tanstack/react-table'
import { Link, useLocation } from 'react-router-dom'
import type { Person } from '../../shared/api'
import { PageHeader, SearchInput, SelectFilter, booleanOptions } from '../../shared/components'
import { DataTable, useList } from '../../shared/table'
import { TelegramLink, TelegramMentions } from '../../shared/TelegramLink'
import { date, yesNo } from '../../shared/format'

export default function PeoplePage() {
  const location = useLocation()
  const list = useList<Person>('/people', { sort: 'name' }, [
    'search',
    'is_russian_citizen',
    'is_itmo_student',
  ])
  const columns: ColumnDef<Person, unknown>[] = [
    { accessorKey: 'id', header: 'ID', enableSorting: false },
    {
      id: 'name',
      accessorFn: (p) => p.full_name || p.display_name,
      header: 'Участник',
      enableHiding: false,
      cell: ({ row: { original: p } }) => (
        <div className="person-cell">
          <span className="avatar">{(p.full_name || p.display_name).slice(0, 1)}</span>
          <div>
            <strong>
              <TelegramMentions text={p.full_name || p.display_name} />
            </strong>
            <small>
              {p.username ? (
                <TelegramLink username={p.username} id={p.telegram_user_id} />
              ) : (
                'Telegram ID ' + p.telegram_user_id
              )}
            </small>
          </div>
        </div>
      ),
    },
    {
      accessorKey: 'visits',
      header: 'Посещения',
      cell: (info) => <span className="number">{String(info.getValue())}</span>,
    },
    {
      id: 'last_visit',
      accessorKey: 'last_visit_at',
      header: 'Последний визит',
      cell: (info) => date(info.getValue() as string | null),
    },
    {
      accessorKey: 'feedback_count',
      header: 'Отзывы',
      enableSorting: false,
      cell: ({ row }) => (
        <Link
          className="text-link"
          state={{ from: location.pathname + location.search }}
          to={'/admin/feedback?author_id=' + row.original.id}
        >
          {row.original.feedback_count} →
        </Link>
      ),
    },
    {
      accessorKey: 'is_itmo_student',
      header: 'ИТМО',
      enableSorting: false,
      cell: (info) => yesNo(info.getValue() as boolean | null),
    },
    {
      accessorKey: 'is_russian_citizen',
      header: 'Гражданство РФ',
      enableSorting: false,
      cell: (info) => yesNo(info.getValue() as boolean | null),
    },
  ]
  return (
    <>
      <PageHeader title="Участники" />
      <div className="toolbar">
        <SearchInput
          value={list.params.get('search') || ''}
          onChange={(v) => list.set('search', v)}
          placeholder="Имя, @username или ID"
        />
        <SelectFilter
          label="Студент ИТМО"
          options={booleanOptions}
          value={list.params.get('is_itmo_student') || ''}
          onChange={(v) => list.set('is_itmo_student', v)}
        />
        <SelectFilter
          label="Гражданство РФ"
          options={booleanOptions}
          value={list.params.get('is_russian_citizen') || ''}
          onChange={(v) => list.set('is_russian_citizen', v)}
        />
        <button className="text-button" onClick={list.reset}>
          Сбросить
        </button>
      </div>
      <DataTable name="Участники" columns={columns} list={list} />
      <p className="footnote">Посещения учитываются по ответам участников. Время — Москва.</p>
    </>
  )
}
