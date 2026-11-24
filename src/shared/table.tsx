import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type RowData,
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
import { api, memberApi, type Page } from './api'
import { positiveInteger } from './format'
import { ErrorState } from './components'
import { ReorderHandle } from './ReorderHandle'

declare module '@tanstack/react-table' {
  interface ColumnMeta<TData extends RowData, TValue> {
    sortField?: string
  }
}

export const AdministratorContext = createContext(0)

function ColumnMenu({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const menu = useRef<HTMLDetailsElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const container = menu.current
    const popup = panel.current
    const table = container?.closest('.table-section')?.querySelector('.table-scroll')
    if (!open || !container || !popup || !table) return
    const viewport = window.visualViewport
    const position = () => {
      const anchor = container.getBoundingClientRect()
      const top = viewport?.offsetTop ?? 0
      const bottom = top + (viewport?.height ?? window.innerHeight)
      const below = Math.min(table.getBoundingClientRect().bottom, bottom) - anchor.bottom
      const above = anchor.top - top
      const upward = below < popup.scrollHeight + 2 && above > below
      popup.dataset.side = upward ? 'above' : 'below'
      popup.style.maxHeight = Math.max(0, Math.floor(upward ? above : below)) + 'px'
    }
    const outside = (event: Event) => {
      if (event.target instanceof Node && !container.contains(event.target)) setOpen(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      container.querySelector('summary')?.focus({ preventScroll: true })
    }
    position()
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(position) : null
    observer?.observe(table)
    document.addEventListener('pointerdown', outside, true)
    document.addEventListener('focusin', outside)
    document.addEventListener('keydown', escape)
    window.addEventListener('resize', position)
    window.addEventListener('scroll', position, true)
    viewport?.addEventListener('resize', position)
    viewport?.addEventListener('scroll', position)
    return () => {
      observer?.disconnect()
      document.removeEventListener('pointerdown', outside, true)
      document.removeEventListener('focusin', outside)
      document.removeEventListener('keydown', escape)
      window.removeEventListener('resize', position)
      window.removeEventListener('scroll', position, true)
      viewport?.removeEventListener('resize', position)
      viewport?.removeEventListener('scroll', position)
    }
  }, [open])
  return (
    <details className="columns-menu" ref={menu} open={open}>
      <summary
        onClick={(event) => {
          event.preventDefault()
          setOpen(!open)
        }}
      >
        <SlidersHorizontal size={16} />
        Колонки
      </summary>
      {open && (
        <div ref={panel} className="columns-popover" data-reorder-zone>
          {children}
        </div>
      )}
    </details>
  )
}

export function useList<T>(
  endpoint: string,
  defaults: { sort: string; order?: string },
  filters: string[],
  scope: 'admin' | 'member' = 'admin',
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
    ...(scope === 'member' && { staleTime: 0, refetchOnWindowFocus: true }),
    queryKey: scope === 'member' ? ['member', endpoint, queryString] : [endpoint, queryString],
    queryFn: ({ signal }) => (scope === 'member' ? memberApi : api)<Page<T>>(endpoint + '?' + queryString, { signal }),
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
  onRowClick,
  rowClassName,
}: {
  name: string
  columns: ColumnDef<T, unknown>[]
  list: Pick<ReturnType<typeof useList<T>>, 'sort' | 'order' | 'page' | 'size' | 'setSort' | 'set' | 'reset'> & {
    query: { data?: Page<T>; error?: Error | null; isFetching: boolean; isPending: boolean; refetch?: () => unknown }
  }
  empty?: string
  columnSettings?: ReactNode
  onResetColumns?: () => void
  onRowClick?: (item: T) => void
  rowClassName?: (item: T) => string
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
    return <ErrorState error={list.query.error} retry={list.query.refetch} />
  return (
    <section className="table-section" aria-label={name}>
      <div className="table-caption">
        <span aria-live="polite">
          {list.query.isPending ? 'Загрузка…' : 'Найдено: ' + (meta?.total_items ?? 0)}
          {list.query.isFetching && !list.query.isPending && ' · обновление'}
        </span>
        <ColumnMenu>
          {columnSettings}
          {table.getAllLeafColumns().map((c, index, all) => (
            <div
              className="column-option"
              data-reorder-id={c.id}
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
              <ReorderHandle
                id={c.id}
                label={'Переместить колонку ' + String(c.columnDef.header)}
                items={normalizedOrder}
                move={move}
              />
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
        </ColumnMenu>
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
                {group.headers.map((header) => {
                  const sortField = header.column.columnDef.meta?.sortField ?? header.column.id
                  return (
                    <th
                      key={header.id}
                      aria-sort={
                        list.sort === sortField
                          ? list.order === 'asc'
                            ? 'ascending'
                            : 'descending'
                          : undefined
                      }
                    >
                      {header.column.getCanSort() ? (
                        <button className="sort-button" onClick={() => list.setSort(sortField)}>
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {list.sort === sortField ? (
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
                  )
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className={rowClassName?.(row.original)} onClick={onRowClick && ((event) => {
                if (event.target instanceof Element && !event.target.closest('a, button, input, select, summary')) onRowClick(row.original)
              })}>
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
