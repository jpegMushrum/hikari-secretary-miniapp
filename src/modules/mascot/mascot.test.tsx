// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, Outlet } from 'react-router-dom'
import Layout from '../../app/Layout'
import AdminMascot from './AdminMascot'
import MemberMascot from './MemberMascot'
import MascotScreen from './MascotScreen'
import type { Entry, View } from './model'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })
const json = (payload: unknown) => new Response(JSON.stringify(payload))
const entry: Entry = { id: 10, name: 'Кицунэ', description: 'Лисёнок с фонариком', images: [], approved: true, author: 'Личное имя автора' }
function state(phase: View['season']['phase'], changes: Partial<View> = {}): View {
  return {
    season: { id: 2, phase, round: 1, deadline: null, winner_id: null },
    eligible: false, ready: false, can_ready: false, entries: [], voters: [],
    card: null, remaining: 0, rounds: [], finalists: [], pending_images: [], ...changes,
  }
}
function mount(element: React.ReactNode, client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })) {
  return render(<QueryClientProvider client={client}><MemoryRouter>{element}</MemoryRouter></QueryClientProvider>)
}

it('keeps both active season links and hides only the season whose own visibility changes', async () => {
  let mascotVisible = true
  vi.stubGlobal('fetch', async (path: string) => {
    if (path.endsWith('/member/me')) return json({ first_name: 'Аня', telegram_id: 1, is_admin: false })
    if (path.endsWith('/santa/visibility')) return json({ visible: true })
    if (path.endsWith('/mascot/visibility')) return json({ visible: mascotVisible,
      submission_until: mascotVisible ? new Date(Date.now() + 90 * 60_000).toISOString() : undefined })
    return json({ local: false })
  })
  function shell() {
    const client = new QueryClient()
    const rendered = render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/events']}>
      <Routes><Route element={<Layout />}><Route path="/events" element={<h1>Встречи</h1>} /></Route></Routes>
    </MemoryRouter></QueryClientProvider>)
    return rendered
  }
  const first = shell()
  expect((await screen.findByRole('link', { name: /Выборы маскота.*До закрытия формы: 01:30/ })).getAttribute('href')).toBe('/mascot')
  expect(screen.getByRole('link', { name: /Тайный Санта/ })).toBeTruthy()
  first.unmount()
  mascotVisible = false
  shell()
  await screen.findByRole('link', { name: /Тайный Санта/ })
  expect(screen.queryByRole('link', { name: /Выборы маскота/ })).toBeNull()
})

it.each(['member', 'admin'] as const)('downloads only expanded %s entries and releases their blob on collapse', async scope => {
  const view = state('submissions', { entries: [
    { ...entry, images: [{ key: 'first', ai: false }] },
    { ...entry, id: 11, name: 'Тануки', images: [{ key: 'second', ai: false }] },
  ] })
  const requests: string[] = []
  const revoke = vi.fn()
  vi.stubGlobal('URL', class extends URL {
    static createObjectURL = () => 'blob:opened-concept'
    static revokeObjectURL = revoke
  })
  vi.stubGlobal('fetch', async (path: string) => {
    if (!path.includes('/images/')) return json(view)
    requests.push(path)
    return new Response('photo')
  })
  mount(scope === 'member' ? <MemberMascot /> : <AdminMascot />)
  const summary = await screen.findByRole('button', { name: 'Открыть концепт «Кицунэ»' })
  expect(requests).toEqual([])
  await userEvent.click(summary)
  await screen.findByRole('img', { name: 'Кицунэ, изображение 1' })
  expect(requests).toEqual(['/api/v1/' + scope + '/mascot/images/first'])
  await userEvent.click(screen.getByRole('button', { name: 'Закрыть' }))
  await waitFor(() => expect(revoke).toHaveBeenCalledWith('blob:opened-concept'))
  expect(screen.queryByRole('img', { hidden: true })).toBeNull()
})

it('losing submission eligibility disables an open editor and still allows cancellation and withdrawal', async () => {
  const view = state('submissions', { eligible: true, entries: [entry] })
  vi.stubGlobal('fetch', async () => json(view))
  const client = new QueryClient()
  mount(<MemberMascot />, client)
  await userEvent.click(await screen.findByRole('button', { name: 'Редактировать' }))
  await act(async () => client.setQueryData(['mascot', 'member', 'view'], { ...view, eligible: false }))
  await waitFor(() => expect((screen.getByLabelText('Имя маскота') as HTMLInputElement).disabled).toBe(true))
  expect((screen.getByLabelText(/Добавить изображения/) as HTMLInputElement).disabled).toBe(true)
  await userEvent.click(screen.getByRole('button', { name: 'Отмена' }))
  expect(screen.queryByLabelText('Имя маскота')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Подать концепт' })).toBeNull()
  expect((screen.getByRole('button', { name: 'Редактировать' }) as HTMLButtonElement).disabled).toBe(true)
  await userEvent.click(screen.getByRole('button', { name: 'Отозвать заявку' }))
  expect(screen.getByRole('dialog', { name: /Отозвать/ })).toBeTruthy()
})

it('allows an ineligible author to confirm voting readiness in a new round', async () => {
  const view = state('readiness', { can_ready: true })
  view.season.round = 3
  const commands: object[] = []
  vi.stubGlobal('fetch', async (_path: string, options?: RequestInit) => {
    if (options?.method === 'POST') {
      commands.push(JSON.parse(options.body as string)); view.ready = true
      return new Response(null, { status: 204 })
    }
    return json(view)
  })
  mount(<MemberMascot />)
  await userEvent.click(await screen.findByRole('button', { name: 'Я готов' }))
  expect(commands).toEqual([{ action: 'ready', season_id: 2, round: 3 }])
  expect(await screen.findByText(/Готовность подтверждена/)).toBeTruthy()
})

it('shows an anonymous concept and its per-image AI marking, submits a skip and resumes from the next card', async () => {
  const view = state('voting', { ready: true, card: { ...entry, images: [{ key: 'a', ai: true }, { key: 'b', ai: false }] }, remaining: 2 })
  const commands: object[] = []
  vi.stubGlobal('fetch', async (path: string, options?: RequestInit) => {
    if (path.includes('/images/')) return new Response('', { status: 404 })
    if (options?.method === 'POST') {
      commands.push(JSON.parse(options.body as string))
      view.card = { ...entry, id: 11, name: 'Тануки' }; view.remaining = 1
      return new Response(null, { status: 204 })
    }
    return json(view)
  })
  mount(<MemberMascot />)
  await screen.findByRole('heading', { name: 'Кицунэ' })
  expect(screen.getAllByText('Создано с помощью ИИ')).toHaveLength(1)
  expect(screen.queryByText(entry.author!)).toBeNull()
  await userEvent.click(screen.getByRole('button', { name: 'Пропустить' }))
  await screen.findByRole('heading', { name: 'Тануки' })
  expect(commands).toEqual([{ action: 'vote', like: false, entry_id: 10, round: 1, season_id: 2 }])
})

it('uploads a file in the current season and saves the concept with its own image marking', async () => {
  const view = state('submissions', { eligible: true })
  view.season.round = 0
  let uploaded: BodyInit | null | undefined
  const commands: Record<string, unknown>[] = []
  vi.stubGlobal('fetch', async (path: string, options?: RequestInit) => {
    if (path === '/api/v1/member/mascot/images?season_id=2') { uploaded = options?.body; return json({ key: 'k' }) }
    if (path.endsWith('/images/k')) return new Response(null, { status: 404 })
    if (options?.method === 'POST') { commands.push(JSON.parse(options.body as string)); return new Response(null, { status: 204 }) }
    return json(view)
  })
  mount(<MemberMascot />)
  await userEvent.click(await screen.findByRole('button', { name: 'Подать концепт' }))
  fireEvent.change(screen.getByLabelText('Имя маскота'), { target: { value: 'Лиса' } })
  fireEvent.change(screen.getByLabelText('Описание'), { target: { value: 'Эскиз' } })
  const file = new File(['fake'], 'sketch.png', { type: 'image/png' })
  fireEvent.change(screen.getByLabelText(/Добавить изображения/), { target: { files: [file] } })
  await userEvent.click(await screen.findByRole('checkbox', { name: 'Изображение 1 создано с помощью ИИ' }))
  await userEvent.click(screen.getByRole('button', { name: 'Сохранить заявку' }))
  expect(uploaded).toBe(file)
  expect(commands[0]).toMatchObject({ action: 'submit', name: 'Лиса', description: 'Эскиз', season_id: 2, round: 0, images: [{ key: 'k', ai: true }] })
})

it('keeps closed results from participants, and the projector displays each round without authors or admin actions', async () => {
  const row = { entry_id: 10, name: 'Кицунэ', place: 1, likes: 1, skips: 2, percent: 33.3 }
  const view = state('results', { entries: [entry], rounds: [
    { number: 1, rows: [row], cancelled: false },
    { number: 2, rows: [{ ...row, likes: 0, skips: 0, percent: null }], cancelled: true },
  ] })
  vi.stubGlobal('fetch', async () => json(view))
  const member = mount(<MemberMascot />)
  await screen.findByText(/Ожидаем объявления/)
  expect(screen.queryByRole('table')).toBeNull()
  member.unmount()
  mount(<MascotScreen />)
  const first = await screen.findByRole('table', { name: 'Итоги тура 1' })
  expect(within(first).getByText('33,3 %')).toBeTruthy()
  const bar = within(first).getByRole('cell', { name: '33,3 %' }).firstElementChild as HTMLElement
  expect(bar.style.width).toBe('33.3%')
  expect(within(first).queryByRole('columnheader', { name: 'Оценили' })).toBeNull()
  expect(within(screen.getByRole('table', { name: 'Итоги тура 2' })).getByText('—')).toBeTruthy()
  expect(screen.queryByText(entry.author!)).toBeNull()
  expect(screen.queryByRole('button', { name: 'Показать результаты участникам' })).toBeNull()
})

it('discards removed and cancelled uploads while preserving the original attachment', async () => {
  const view = state('submissions', { eligible: true, entries: [{ ...entry, images: [{ key: 'attached', ai: false }] }] })
  const deleted: string[] = []
  let sequence = 0
  vi.stubGlobal('fetch', async (path: string, options?: RequestInit) => {
    if (options?.method === 'DELETE') { deleted.push(path.split('/').pop()!); return new Response(null, { status: 204 }) }
    if (options?.method === 'POST') return json({ key: 'new' + ++sequence })
    if (path.includes('/images/')) return new Response(null, { status: 404 })
    return json(view)
  })
  mount(<MemberMascot />)
  await userEvent.click(await screen.findByRole('button', { name: 'Редактировать' }))
  const file = new File(['x'], 'concept.png', { type: 'image/png' })
  fireEvent.change(screen.getByLabelText(/Добавить изображения/), { target: { files: [file, file] } })
  await userEvent.click(await screen.findByRole('button', { name: 'Убрать изображение 3' }))
  await userEvent.click(screen.getByRole('button', { name: 'Отмена' }))
  await waitFor(() => expect(screen.queryByLabelText('Имя маскота')).toBeNull())
  expect(deleted).toEqual(['new2', 'new1'])
})

it('releases successful uploads from a batch when the next upload fails', async () => {
  const deleted: string[] = []
  let count = 0
  vi.stubGlobal('fetch', async (path: string, options?: RequestInit) => {
    if (options?.method === 'DELETE') { deleted.push(path); return new Response(null, { status: 204 }) }
    if (options?.method === 'POST') return ++count === 1 ? json({ key: 'first' }) : new Response(null, { status: 400 })
    return json(state('submissions', { eligible: true }))
  })
  mount(<MemberMascot />)
  await userEvent.click(await screen.findByRole('button', { name: 'Подать концепт' }))
  const file = new File(['x'], 'test.png', { type: 'image/png' })
  fireEvent.change(screen.getByLabelText(/Добавить изображения/), { target: { files: [file, file] } })
  await screen.findByRole('alert')
  expect(deleted).toEqual(['/api/v1/member/mascot/images/first'])
  expect(screen.queryByRole('checkbox', { name: 'Изображение 1 создано с помощью ИИ' })).toBeNull()
})

it('discards abandoned uploads only after the user confirms the snapshot', async () => {
  const view = state('submissions', { pending_images: ['abandoned'] })
  const deleted: string[] = []
  vi.stubGlobal('fetch', async (path: string, options?: RequestInit) => {
    if (options?.method === 'DELETE') {
      deleted.push(path)
      view.pending_images = []
      return new Response(null, { status: 204 })
    }
    return json(view)
  })
  mount(<MemberMascot />)
  await userEvent.click(await screen.findByRole('button', { name: /Очистить незавершённые/ }))
  await userEvent.click(screen.getByRole('button', { name: 'Отмена' }))
  expect(deleted).toEqual([])
  await userEvent.click(screen.getByRole('button', { name: /Очистить незавершённые/ }))
  await userEvent.click(screen.getByRole('button', { name: 'Удалить загрузки' }))
  await waitFor(() => expect(screen.queryByRole('button', { name: /Очистить незавершённые/ })).toBeNull())
  expect(deleted).toEqual(['/api/v1/member/mascot/images/abandoned'])
})

it('starts another runoff with only the selected leaders', async () => {
  const view = state('results', { entries: [entry, { ...entry, id: 12, name: 'Сова' }, { ...entry, id: 13, name: 'Кот' }], finalists: [10, 12, 13] })
  view.season.round = 2
  const commands: object[] = []
  vi.stubGlobal('fetch', async (_path: string, options?: RequestInit) => {
    if (options?.method === 'POST') { commands.push(JSON.parse(options.body as string)); return new Response(null, { status: 204 }) }
    return json(view)
  })
  mount(<Routes><Route element={<Outlet context={{ local: false }} />}><Route index element={<AdminMascot />} /></Route></Routes>)
  await userEvent.click(await screen.findByRole('checkbox', { name: 'Сова' }))
  expect(screen.queryByRole('button', { name: 'Перезапустить тестовые выборы' })).toBeNull()
  await userEvent.click(screen.getByRole('button', { name: 'Открыть сбор на тур 3' }))
  await waitFor(() => expect(commands).toEqual([{ action: 'runoff', entry_ids: [10, 13], season_id: 2, round: 2 }]))
})

it('starts a fresh local season only after the admin confirms the reset', async () => {
  const requests: unknown[] = []
  let view = state('published')
  vi.stubGlobal('fetch', async (path: string, options?: RequestInit) => {
    if (options?.method === 'POST') {
      requests.push([path, JSON.parse(options.body as string)])
      view = state('preparation')
      view.season.id = 3
      return new Response(null, { status: 204 })
    }
    return json(view)
  })
  mount(<Routes><Route element={<Outlet context={{ local: true }} />}><Route index element={<AdminMascot />} /></Route></Routes>)
  const reset = await screen.findByRole('button', { name: 'Перезапустить тестовые выборы' })
  await userEvent.click(reset)
  await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Отмена' }))
  expect(requests).toEqual([])
  await userEvent.click(reset)
  await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Перезапустить' }))
  await screen.findByRole('button', { name: 'Открыть приём заявок' })
  expect(requests).toEqual([['/api/v1/admin/mascot/test-reset', { season_id: 2 }]])
})

it.each(['admin', 'member', 'projector'] as const)('opens an anonymous result concept on demand in %s view', async context => {
  const view = state('published', { rounds: [{ number: 1, cancelled: false, rows: [
    { entry_id: entry.id, name: entry.name, place: 1, likes: 1, skips: 0, percent: 100 },
  ] }] })
  const requests: string[] = []
  vi.stubGlobal('fetch', async (path: string) => {
    if (!path.includes('/results/entries/')) return json(view)
    requests.push(path)
    return json(entry)
  })
  mount(context === 'member' ? <MemberMascot /> : context === 'projector' ? <MascotScreen /> : <AdminMascot />)
  const open = await screen.findByRole('button', { name: 'Открыть концепт «Кицунэ»' })
  expect(requests).toEqual([])
  await userEvent.click(open)
  const dialog = screen.getByRole('dialog', { name: entry.name })
  expect(await within(dialog).findByText(entry.description)).toBeTruthy()
  expect(within(dialog).queryByText(entry.author!)).toBeNull()
  expect(requests).toEqual(['/api/v1/' + (context === 'member' ? 'member' : 'admin') + '/mascot/results/entries/' + entry.id])
  await userEvent.click(within(dialog).getByRole('button', { name: 'Закрыть' }))
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.getByRole('table')).toBeTruthy()
})

it('keeps a projected concept open during a network failure and closes it if access is revoked', async () => {
  const view = state('results', { rounds: [{ number: 1, cancelled: false, rows: [
    { entry_id: entry.id, name: entry.name, place: 1, likes: 1, skips: 0, percent: 100 },
  ] }] })
  let status = 200
  vi.stubGlobal('fetch', async (path: string) => path.includes('/results/entries/') ? json(entry)
    : status === 200 ? json(view) : new Response('{}', { status }))
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  mount(<MascotScreen />, client)
  await userEvent.click(await screen.findByRole('button', { name: 'Открыть концепт «Кицунэ»' }))
  await within(screen.getByRole('dialog')).findByText(entry.description)
  const refresh = () => act(() => client.refetchQueries({ queryKey: ['mascot', 'admin', 'view'] }))
  status = 503
  await refresh()
  expect(screen.getByRole('dialog')).toBeTruthy()
  status = 403
  await refresh()
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
})

it('links ready voters by Telegram username or by Telegram ID and does not use a club ID for the link', async () => {
  vi.stubGlobal('fetch', async () => json(state('readiness', { voters: [
    { person_id: 1, name: 'Аня', excluded: false, username: 'club_anya', telegram_id: 1001 },
    { person_id: 2, name: 'Боря', excluded: false, telegram_id: 1002 },
    { person_id: 3, name: 'Вера', excluded: false },
  ] })))
  mount(<AdminMascot />)
  expect((await screen.findByRole('link', { name: '@club_anya' })).getAttribute('href')).toBe('https://t.me/club_anya')
  expect(screen.getByRole('link', { name: /Открыть профиль/ }).getAttribute('href')).toBe('tg://user?id=1002')
  expect(screen.getAllByRole('link')).toHaveLength(2)
})
