// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { DataTable, useList } from './table'

function Fixture() {
  const list = useList<{ a: string; b: string }>('/items', { sort: 'a' }, [])
  return (
    <DataTable
      name="Тест"
      columns={[
        { accessorKey: 'a', header: 'Первая' },
        { accessorKey: 'b', header: 'Вторая' },
      ]}
      list={list}
    />
  )
}

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.unstubAllGlobals()
})

async function mountTable() {
  vi.stubGlobal(
    'fetch',
    async () => new Response(JSON.stringify({ items: [], page: { total_items: 0 } })),
  )
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <Fixture />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  await screen.findByText('Найдено: 0')
}

it('fits the menu above a short table, updates on resize and dismisses on Escape or outside press', async () => {
  await mountTable()
  const summary = screen.getByText('Колонки')
  const menu = summary.closest('details')!
  const table = menu.closest('section')!.querySelector('.table-scroll')!
  menu.getBoundingClientRect = () => new DOMRect(0, 250, 80, 30)
  table.getBoundingClientRect = () => new DOMRect(0, 290, 300, 50)
  fireEvent.click(summary)
  const panel = menu.querySelector<HTMLElement>('[data-column-zone]')!
  Object.defineProperty(panel, 'scrollHeight', { value: 400 })
  fireEvent.resize(window)
  expect(panel.dataset.side).toBe('above')
  expect(panel.style.maxHeight).toBe('250px')
  menu.getBoundingClientRect = () => new DOMRect(0, 0, 80, 30)
  fireEvent.resize(window)
  expect(panel.dataset.side).toBe('below')
  expect(panel.style.maxHeight).toBe('310px')
  screen.getByRole('checkbox', { name: 'Первая' }).focus()
  fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
  expect(menu.open).toBe(false)
  expect(document.activeElement).toBe(summary)
  fireEvent.click(summary)
  fireEvent.pointerDown(document.body)
  expect(menu.open).toBe(false)
})

it('keeps headers sortable, scrolls the menu at its edge and cancels the frame on drop or cancellation', async () => {
  await mountTable()
  const [first, second] = screen.getAllByRole('columnheader')
  expect(first.draggable).toBe(false)
  expect(within(first).queryByRole('button', { name: /Переместить/ })).toBeNull()
  fireEvent.click(within(first).getByRole('button', { name: 'Первая' }))
  expect(first.getAttribute('aria-sort')).toBe('descending')
  fireEvent.click(screen.getByText('Колонки'))
  const grip = screen.getByRole('button', { name: 'Переместить колонку Первая' })
  const destination = screen.getByRole('checkbox', { name: 'Вторая' })
  const option = destination.closest<HTMLElement>('[data-column-id]')!
  const panel = option.closest<HTMLElement>('[data-column-zone]')!
  panel.getBoundingClientRect = () => new DOMRect(0, 0, 100, 100)
  Object.defineProperties(panel, { clientHeight: { value: 100 }, scrollHeight: { value: 300 } })
  const frames = new Map<number, FrameRequestCallback>()
  let nextFrame = 0
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++nextFrame, callback)
    return nextFrame
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
  Object.defineProperty(grip, 'setPointerCapture', { value: vi.fn() })
  const original = Object.getOwnPropertyDescriptor(document, 'elementFromPoint')
  Object.defineProperty(document, 'elementFromPoint', {
    configurable: true,
    value: () => destination,
  })
  const pointer = {
    pointerId: 1,
    isPrimary: true,
    pointerType: 'touch',
    button: 0,
    clientX: 95,
    clientY: 95,
  }
  try {
    fireEvent.pointerDown(grip, pointer)
    fireEvent.pointerMove(grip, pointer)
    for (const [id, callback] of [...frames]) {
      frames.delete(id)
      callback(0)
    }
    expect(panel.scrollTop).toBeGreaterThan(0)
    expect(option.hasAttribute('data-drop-target')).toBe(true)
    fireEvent.pointerCancel(grip, pointer)
    expect(frames.size).toBe(0)
    expect(option.hasAttribute('data-drop-target')).toBe(false)
    expect(screen.getAllByRole('columnheader')[0]).toBe(first)
    fireEvent.pointerDown(grip, pointer)
    fireEvent.pointerMove(grip, pointer)
    fireEvent.pointerUp(grip, pointer)
    expect(frames.size).toBe(0)
    expect(screen.getAllByRole('columnheader')[0]).toBe(second)
    expect(JSON.parse(localStorage.getItem('hikari.columns.0.Тест.order')!)).toEqual(['b', 'a'])
    fireEvent.keyDown(grip, { key: 'ArrowUp' })
    expect(screen.getAllByRole('columnheader')[0]).toBe(first)
  } finally {
    if (original) Object.defineProperty(document, 'elementFromPoint', original)
    else Reflect.deleteProperty(document, 'elementFromPoint')
  }
})
