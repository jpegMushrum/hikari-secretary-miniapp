import { useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { DataTable } from '../../shared/table'
import { attendanceLabels, giftLabels, type AdminView, type Participant } from './model'
import './santa-roster.css'

export const statusLabel = { active: 'Участвует', excluded: 'Исключён', exit_requested: 'Запросил выход' }
const collator = new Intl.Collator('ru', { numeric: true, sensitivity: 'base' })

export function SantaRoster({ view, open, personName }: {
  view: AdminView; open: (p: Participant) => void; personName: (id: number) => string
}) {
  const [sort, setSort] = useState('name')
  const [order, setOrder] = useState<'asc' | 'desc'>('asc')
  const [pageSize, setPageSize] = useState(10)
  const [pageNumber, setPageNumber] = useState(1)
  const [showRecipients, setShowRecipients] = useState(false)
  const recipients = new Map(view.pairs.map(pair => [pair.giver_id, pair.recipient_id]))
  const rows = view.participants.map(person => {
    const recipient = recipients.get(person.person_id)
    return {
      person, id: person.person_id, name: personName(person.person_id), status: statusLabel[person.status],
      attendance: view.season.confirmed ? attendanceLabels[person.attendance] : '—',
      gift: view.season.confirmed ? giftLabels[person.gift] : '—',
      recipient: view.season.confirmed && recipient ? (showRecipients ? personName(recipient) : 'Скрыто') : '—',
    }
  })
  type Row = typeof rows[number]
  type Key = Exclude<keyof Row, 'person'>
  const columns: ColumnDef<Row>[] = [
    { accessorKey: 'id', header: 'ID' },
    { accessorKey: 'name', header: 'Участник', enableHiding: false, cell: ({ row }) => (
      <button type="button" className="santa-person-name" onClick={() => open(row.original.person)}>{row.original.name}</button>
    ) },
    { accessorKey: 'status', header: 'Участие' },
    { accessorKey: 'attendance', header: 'Придёт' },
    { accessorKey: 'gift', header: 'Готовность подарка' },
    { accessorKey: 'recipient', header: 'Подопечный' },
  ]
  const sorted = rows.sort((a, b) => {
    const compare = collator.compare(String(a[sort as Key]), String(b[sort as Key])) || a.id - b.id
    return order === 'asc' ? compare : -compare
  })
  const pages = Math.max(1, Math.ceil(rows.length / pageSize))
  const page = Math.min(pageNumber, pages)
  return <>
    {view.season.confirmed && <p className="santa-roster-legend">
      <span className="santa-person-ready">Зелёный — подарок готов</span>
      <span className="santa-person-exit">Красный — запрос на выход</span>
    </p>}
    {view.season.confirmed && <button type="button" className="text-button" aria-pressed={showRecipients}
      onClick={() => setShowRecipients(!showRecipients)}>{showRecipients ? 'Скрыть подопечных' : 'Показать подопечных'}</button>}
    <DataTable<Row> name="Участники Тайного Санты" columns={columns}
    onRowClick={row => open(row.person)} rowClassName={({ person }) => {
      if (person.status === 'exit_requested') return 'santa-person-row santa-person-exit'
      if (person.status === 'active' && person.gift === 'ready') return 'santa-person-row santa-person-ready'
      return 'santa-person-row'
    }}
    list={{
      page, size: pageSize, sort, order,
      query: { isFetching: false, isPending: false, data: {
        items: sorted.slice((page - 1) * pageSize, page * pageSize),
        page: { number: page, size: pageSize, total_items: rows.length, total_pages: pages },
      } },
      setSort: field => {
        setOrder(field === sort && order === 'asc' ? 'desc' : 'asc')
        setSort(field)
        setPageNumber(1)
      },
      set: (field, value) => {
        if (field === 'page') setPageNumber(Number(value))
        else if (field === 'page_size') { setPageSize(Number(value)); setPageNumber(1) }
      },
      reset: () => { setSort('name'); setOrder('asc'); setPageNumber(1) },
    }} />
  </>
}
