import { Link, useLocation } from 'react-router-dom'
import type { ColumnDef } from '@tanstack/react-table'
import { DataTable, useList } from '../../shared/table'
import { BackLink, PageHeader, SelectFilter, Status } from '../../shared/components'
import { dateTime } from '../../shared/format'

type Item = {
  id: number
  text: string
  status: string
  created_at: string
  scheduled_at: string | null
}
export default function PublicationsPage() {
  const location = useLocation(),
    list = useList<Item>('/publications', { sort: 'created_at', order: 'desc' }, ['status'])
  const columns: ColumnDef<Item, unknown>[] = [
    { accessorKey: 'id', header: 'ID' },
    {
      id: 'text',
      accessorKey: 'text',
      header: 'Анонс',
      enableHiding: false,
      cell: ({ row }) => (
        <Link
          className="feedback-preview"
          to={'/admin/publications/' + row.original.id}
          state={{ from: location.pathname + location.search }}
        >
          {row.original.text || 'Анонс #' + row.original.id}
        </Link>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Статус',
      cell: (i) => <Status value={i.getValue() as string} />,
    },
    { accessorKey: 'created_at', header: 'Получен', cell: (i) => dateTime(i.getValue() as string) },
    {
      accessorKey: 'scheduled_at',
      header: 'Публикация',
      cell: (i) => dateTime(i.getValue() as string | null),
    },
  ]
  return (
    <>
      <BackLink to="/admin/events">Мероприятия</BackLink>
      <PageHeader
        title="Анонсы и черновики"
        description="Отправьте или перешлите анонс боту. В ответ он предложит открыть черновик здесь или продолжить в чате."
      />
      <div className="toolbar">
        <SelectFilter
          label="Статус публикации"
          value={list.params.get('status') || ''}
          onChange={(v) => list.set('status', v)}
          options={[
            ['', 'Все'],
            ['draft', 'Черновики'],
            ['scheduled', 'В очереди'],
            ['sent', 'Опубликованы'],
            ['failed', 'С ошибками'],
            ['cancelled', 'Отменены'],
          ]}
        />
      </div>
      <DataTable name="Публикации" columns={columns} list={list} />
    </>
  )
}
