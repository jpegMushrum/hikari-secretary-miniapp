import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type VisibilityState,
} from '@tanstack/react-table'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
} from 'lucide-react'
import { api, type Page } from './api'
import { positiveInteger } from './format'
import { ErrorState } from './components'

export const AdministratorContext = createContext(0)
export function useList<T>(
  endpoint: string,
  defaults: { sort: string; order?: string },
  filters: string[],
) {
  const [params, setParams] = useSearchParams()
  const page = positiveInteger(params.get('page'), 1)
  const size = [10, 20, 30].includes(Number(params.get('page_size')))
    ? Number(params.get('page_size'))
    : 10
  const sort = params.get('sort') || defaults.sort
  const order =
    params.get('order') === 'desc'
      ? 'desc'
      : params.get('order') === 'asc'
        ? 'asc'
        : defaults.order || 'asc'
  const queryParams = new URLSearchParams({
    page: String(page),
    page_size: String(size),
    sort,
    order,
  })
  for (const key of filters) {
    const value = params.get(key)
    if (value) queryParams.set(key, value)
  }
  const queryString = queryParams.toString()
  const query = useQuery({
    queryKey: [endpoint, queryString],
    queryFn: ({ signal }) => api<Page<T>>(endpoint + '?' + queryString, { signal }),
  })
  const set = useCallback(
    (key: string, value: string) =>
      setParams(
        (current) => {
          const next = new URLSearchParams(current)
          if (value) next.set(key, value)
          else next.delete(key)
          if (key !== 'page') next.delete('page')
          return next
        },
        { replace: true },
      ),
    [setParams],
  )
  const setSort = (field: string) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        next.set('sort', field)
        next.set('order', field === sort && order === 'asc' ? 'desc' : 'asc')
        next.delete('page')
        return next
      },
      { replace: true },
    )
  return {
    query,
    params,
    page,
    size,
    sort,
    order,
    set,
    setSort,
    reset: () => setParams({}, { replace: true }),
  }
}

export function DataTable<T>({
  name,
  columns,
  list,
  empty = 'Здесь пока нет записей',
  columnSettings,
  onResetColumns,
}: {
  name: string
  columns: ColumnDef<T, unknown>[]
  list: ReturnType<typeof useList<T>>
  empty?: string
  columnSettings?: ReactNode
  onResetColumns?: () => void
}) {
  const admin = useContext(AdministratorContext)
  const storageKey = 'hikari.columns.' + admin + '.' + name
  const ids = columns.map((c) => c.id || ('accessorKey' in c ? String(c.accessorKey) : ''))
  const [order, setOrder] = useState<string[]>(() => {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(storageKey + '.order') || '[]')
      return Array.isArray(saved) ? saved.filter((id): id is string => typeof id === 'string') : []
    } catch {
      return []
    }
  })
  const normalizedOrder = [...new Set([...order.filter((id) => ids.includes(id)), ...ids])]
  const [dragged, setDragged] = useState<string | null>(null)
  const move = (from: string, to: string) => {
    const next = [...normalizedOrder],
      source = next.indexOf(from),
      destination = next.indexOf(to)
    if (source < 0 || destination < 0) return
    next.splice(source, 1)
    next.splice(destination, 0, from)
    setOrder(next)
  }
  useEffect(() => {
    try {
      localStorage.setItem(storageKey + '.order', JSON.stringify(order))
    } catch {}
  }, [storageKey, order])
  const [visibility, setVisibility] = useState<VisibilityState>(() => {
    try {
      const stored: unknown = JSON.parse(localStorage.getItem(storageKey) || '{}')
      if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {}
      return Object.fromEntries(
        Object.entries(stored).filter(([, value]) => typeof value === 'boolean'),
      )
    } catch {
      return {}
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(visibility))
    } catch {
      /* Private mode may disallow storage. */
    }
  }, [storageKey, visibility])
  const table = useReactTable({
    data: list.query.data?.items ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    manualPagination: true,
    state: { columnVisibility: visibility, columnOrder: normalizedOrder },
    onColumnVisibilityChange: setVisibility,
  })
  const meta = list.query.data?.page
  if (list.query.error)
    return <ErrorState error={list.query.error} retry={() => void list.query.refetch()} />
  return (
    <section className="table-section" aria-label={name}>
      <div className="table-caption">
        <span aria-live="polite">
          {list.query.isPending ? 'Загрузка…' : 'Найдено: ' + (meta?.total_items ?? 0)}
          {list.query.isFetching && !list.query.isPending && ' · обновление'}
        </span>
        <details className="columns-menu">
          <summary>
            <SlidersHorizontal size={16} />
            Колонки
          </summary>
          <div className="columns-popover">
            {columnSettings}
            {table.getAllLeafColumns().map((c, index, all) => (
              <div
                className="column-option"
                key={c.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/plain', c.id)
                  setDragged(c.id)
                }}
                onDragEnd={() => setDragged(null)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  if (dragged) move(dragged, c.id)
                  setDragged(null)
                }}
              >
                <label>
                  <input
                    type="checkbox"
                    checked={c.getIsVisible()}
                    disabled={!c.getCanHide()}
                    onChange={c.getToggleVisibilityHandler()}
                  />
                  {String(c.columnDef.header)}
                </label>
                <button
                  className="icon-button"
                  aria-label={'Поднять колонку ' + c.columnDef.header}
                  disabled={index === 0}
                  onClick={() => move(c.id, all[index - 1].id)}
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  className="icon-button"
                  aria-label={'Опустить колонку ' + c.columnDef.header}
                  disabled={index === all.length - 1}
                  onClick={() => move(c.id, all[index + 1].id)}
                >
                  <ArrowDown size={14} />
                </button>
              </div>
            ))}
            <button
              className="text-button"
              onClick={() => {
                setOrder([])
                setVisibility({})
                onResetColumns?.()
              }}
            >
              Сбросить колонки
            </button>
          </div>
        </details>
      </div>
      <div
        className="table-scroll"
        tabIndex={0}
        role="region"
        aria-label="Таблица, доступна горизонтальная прокрутка"
      >
        <table aria-busy={list.query.isFetching}>
          <thead>
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {group.headers.map((header) => (
                  <th
                    key={header.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', header.column.id)
                      setDragged(header.column.id)
                    }}
                    onDragEnd={() => setDragged(null)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault()
                      if (dragged) move(dragged, header.column.id)
                      setDragged(null)
                    }}
                    aria-sort={
                      list.sort === header.column.id
                        ? list.order === 'asc'
                          ? 'ascending'
                          : 'descending'
                        : undefined
                    }
                  >
                    {header.column.getCanSort() ? (
                      <button
                        className="sort-button"
                        onClick={() => list.setSort(header.column.id)}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {list.sort === header.column.id ? (
                          list.order === 'desc' ? (
                            <ArrowDown size={13} />
                          ) : (
                            <ArrowUp size={13} />
                          )
                        ) : (
                          <ArrowUpDown size={13} />
                        )}
                      </button>
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                ))}
              </tr>
            ))}
            {!table.getRowModel().rows.length && (
              <tr>
                <td className="empty-state" colSpan={table.getVisibleLeafColumns().length}>
                  {list.query.isPending ? (
                    'Загружаем данные клуба…'
                  ) : (
                    <>
                      <strong>{empty}</strong>
                      <span>Попробуйте изменить фильтры или вернитесь позже.</span>
                      <button className="text-button" onClick={list.reset}>
                        Сбросить фильтры
                      </button>
                    </>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <footer className="pagination">
        <label>
          На странице{' '}
          <select value={list.size} onChange={(e) => list.set('page_size', e.target.value)}>
            {[10, 20, 30].map((size) => (
              <option key={size}>{size}</option>
            ))}
          </select>
        </label>
        <div>
          <span>
            {list.page} / {Math.max(1, meta?.total_pages ?? 1)}
          </span>
          <button
            className="icon-button"
            aria-label="Предыдущая страница"
            disabled={list.page <= 1 || list.query.isPending}
            onClick={() => list.set('page', String(list.page - 1))}
          >
            <ChevronLeft size={19} />
          </button>
          <button
            className="icon-button"
            aria-label="Следующая страница"
            disabled={list.query.isPending || list.page >= (meta?.total_pages ?? 1)}
            onClick={() => list.set('page', String(list.page + 1))}
          >
            <ChevronRight size={19} />
          </button>
        </div>
      </footer>
    </section>
  )
}
