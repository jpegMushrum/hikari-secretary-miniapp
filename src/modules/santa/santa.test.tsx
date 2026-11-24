// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import Layout from '../../app/Layout'
import { LocalProfiles } from '../../app/LocalProfiles'
import MemberSanta from './MemberSanta'
import { SeasonDeadline } from './SeasonDeadline'
import AdminSanta from './AdminSanta'
import { type AdminView, type MemberView, type Participant, type Season } from './model'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })
const data = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status })
const season: Season = {
  id: 1, status: 'open', budget: 'До 1000 ₽', exchange_at: '2099-12-28T17:30:00Z',
  registration_until: '2099-12-15T17:30:00Z', reminder_minutes: 1440, revision: 7, confirmed: false,
}
const people: Participant[] = ['Аня', 'Боря', 'Вера'].map((name, i) => ({
  person_id: i + 1, name, wishes: name + ': чай', status: 'active', attendance: 'unknown', gift: 'unknown', gift_description: '',
}))
const pairs = [{ giver_id: 1, recipient_id: 2 }, { giver_id: 2, recipient_id: 3 }, { giver_id: 3, recipient_id: 1 }]
it('counts down to registration and then to the exchange, including early draw confirmation', () => {
  vi.useFakeTimers()
  try {
    vi.setSystemTime(new Date('2026-12-14T10:00:00Z'))
    const dates = { visible: true, registration_until: '2026-12-15T10:00:00Z', exchange_at: '2026-12-20T10:00:00Z' }
    const { rerender } = render(<SeasonDeadline season={{ ...dates, confirmed: true }} />)
    expect(screen.getByText('До итоговой встречи: 6 дней')).toBeTruthy()
    rerender(<SeasonDeadline season={dates} />)
    expect(screen.getByText('До конца записи: 1 день')).toBeTruthy()
    act(() => vi.advanceTimersByTime(1))
    expect(screen.getByText('До конца записи: 23:59')).toBeTruthy()
    act(() => {
      vi.setSystemTime(new Date('2026-12-15T09:59:00Z'))
      fireEvent(document, new Event('visibilitychange'))
    })
    expect(screen.getByText('До конца записи: 00:01')).toBeTruthy()
    act(() => vi.advanceTimersByTime(60_000))
    expect(screen.getByText('До итоговой встречи: 5 дней')).toBeTruthy()
    act(() => {
      vi.setSystemTime(new Date('2026-12-20T09:59:00Z'))
      fireEvent(document, new Event('visibilitychange'))
    })
    expect(screen.getByText('До итоговой встречи: 00:01')).toBeTruthy()
    act(() => vi.advanceTimersByTime(60_000))
    expect(screen.getByText(/^Обмен 20/)).toBeTruthy()
  } finally {
    vi.useRealTimers()
  }
})
function mount(component: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={client}>{component}</QueryClientProvider>)
}

it('shows the affected participant profile separately from the miniapp link in new admin notices', async () => {
  vi.stubGlobal('fetch', async () => data([
    { id: 3, text: 'Боря не придёт', path: '/admin/santa', profile_url: 'https://t.me/test_borya' },
    { id: 2, text: 'Вера просит выйти', path: '/admin/santa', profile_url: 'tg://user?id=987' },
    { id: 1, text: 'Прежнее уведомление', path: '/admin/santa' },
  ]))
  mount(<LocalProfiles profiles={[{ key: 'admin', name: 'Администратор' }]} />)
  await userEvent.setup().click(screen.getByRole('button', { name: 'Тестовые уведомления' }))
  const contacts = await screen.findAllByRole('link', { name: 'Открыть профиль' })
  expect(contacts.map(link => link.getAttribute('href'))).toEqual(['https://t.me/test_borya', 'tg://user?id=987'])
  expect(screen.getByRole('link', { name: 'Боря не придёт' }).getAttribute('href')).toBe('/admin/santa')
  expect(screen.getByRole('link', { name: 'Прежнее уведомление' })).toBeTruthy()
})

it.each([
  { path: '/events', scope: 'member', visible: false },
  { path: '/admin/events', scope: 'admin', visible: true },
  { path: '/events', scope: 'member', visible: true },
])('shows the seasonal link according to $scope visibility=$visible', async ({ path, scope, visible }) => {
  const urls: string[] = []
  vi.stubGlobal('fetch', async (url: string) => {
    urls.push(url)
    if (url === '/api/v1/member/me') return data({ telegram_id: 1, first_name: 'Аня', is_admin: true })
    if (url === '/api/dev/context') return data({ local: false })
    if (url === '/api/v1/' + scope + '/santa/visibility') return data({ visible, registration_until: season.registration_until })
    throw new Error(url)
  })
  mount(<MemoryRouter initialEntries={[path]}><Routes><Route element={<Layout />}>
    <Route path={path} element={<h1>Встречи</h1>} />
  </Route></Routes></MemoryRouter>)
  await screen.findByRole('heading', { name: 'Встречи' })
  await waitFor(() => expect(urls).toContain('/api/v1/' + scope + '/santa/visibility'))
  if (visible) {
    const link = await screen.findByRole('link', { name: /Тайный Санта/ })
    expect(link.getAttribute('href')).toEqual(scope === 'admin' ? '/admin/santa' : '/santa')
    expect(link.closest('nav')?.lastElementChild).toBe(link)
  }
  else expect(screen.queryByRole('link', { name: /Тайный Санта/ })).toBeNull()
})

it('shows an unavailable message for a paused or hidden season accessed by direct link', async () => {
  vi.stubGlobal('fetch', async () => data({ error: 'not_found' }, 404))
  mount(<MemberSanta />)
  await screen.findByRole('heading', { name: 'Сейчас сезон недоступен' })
  expect(screen.queryByRole('textbox')).toBeNull()
})

it('confirms cancellation and restores the saved wishes for rejoining before the draw', async () => {
  const view: MemberView = { season, participation: null, recipient: null, draft_wishes: '' }
  const commands: string[] = []
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    expect(url).toEqual('/api/v1/member/santa')
    if (init.method !== 'POST') return data(view)
    const command = JSON.parse(String(init.body))
    commands.push(command.action)
    if (command.action === 'join') view.participation = { ...people[0], wishes: command.wishes }
    if (command.action === 'cancel') {
      view.draft_wishes = view.participation!.wishes
      view.participation = null
    }
    return new Response(null, { status: 204 })
  })
  mount(<MemberSanta />)
  const user = userEvent.setup()
  await user.type(await screen.findByRole('textbox'), '  Чай  ')
  await user.click(screen.getByRole('button', { name: 'Подтвердить участие' }))
  await screen.findByRole('button', { name: 'Отменить участие' })
  expect(screen.queryByRole('group', { name: 'Присутствие на обмене' })).toBeNull()
  expect(screen.queryByRole('heading', { name: 'Подопечный' })).toBeNull()
  expect(screen.queryByText('Подарок готов?')).toBeNull()
  expect(view.participation?.wishes).toBe('Чай')
  await user.click(screen.getByRole('button', { name: 'Отменить участие' }))
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Остаться' }))
  expect(commands).toEqual(['join'])
  await user.click(screen.getByRole('button', { name: 'Отменить участие' }))
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Да, отменить участие' }))
  await screen.findByRole('button', { name: 'Подтвердить участие' })
  expect(screen.getByRole<HTMLTextAreaElement>('textbox').value).toBe('Чай')
  await user.click(screen.getByRole('button', { name: 'Подтвердить участие' }))
  await screen.findByRole('button', { name: 'Отменить участие' })
  expect(commands).toEqual(['join', 'cancel', 'join'])
})

it('lets a giver describe or clear the actual gift without changing its readiness', async () => {
  const view: MemberView = { season: { ...season, confirmed: true }, participation: { ...people[0] }, recipient: { ...people[1], telegram_id: 222, username: 'test_borya' }, draft_wishes: '' }
  const writes: unknown[] = []
  vi.stubGlobal('fetch', async (_: string, init: RequestInit) => {
    if (init.method !== 'POST') return data(view)
    const command = JSON.parse(String(init.body))
    writes.push(command)
    view.participation!.gift_description = command.gift_description
    return new Response(null, { status: 204 })
  })
  mount(<MemberSanta />)
  const user = userEvent.setup()
  const field = () => screen.getByRole('textbox', { name: 'Подготовленный подарок' })
  const save = () => screen.getByRole<HTMLButtonElement>('button', { name: 'Сохранить описание' })
  await screen.findByRole('button', { name: 'Нет', pressed: true })
  expect(screen.getByRole('link', { name: '@test_borya' }).getAttribute('href')).toBe('https://t.me/test_borya')
  fireEvent.change(field(), { target: { value: '🎁'.repeat(2001) } })
  expect(save().disabled).toBe(true)
  fireEvent.change(field(), { target: { value: '🎁'.repeat(2000) } })
  expect(save().disabled).toBe(false)
  await user.clear(field())
  await user.type(field(), '  Набор чая  ')
  await user.click(save())
  await waitFor(() => expect(save().disabled).toBe(true))
  await user.clear(field())
  await user.click(save())
  await waitFor(() => expect(writes).toEqual(['Набор чая', ''].map(gift_description =>
    ({ action: 'gift_description', season_id: 1, recipient_id: 2, gift_description }))))
  expect(view.participation!.gift).toBe('unknown')
})

it('binds the gift answer to the displayed recipient and keeps it visible while exit is pending', async () => {
  const view: MemberView = { season: { ...season, confirmed: true }, participation: { ...people[0] }, recipient: { ...people[1], telegram_id: 222, username: null }, draft_wishes: '' }
  const commands: Record<string, unknown>[] = []
  vi.stubGlobal('fetch', async (_: string, init: RequestInit) => {
    if (init.method !== 'POST') return data(view)
    const command = JSON.parse(String(init.body))
    commands.push(command)
    view.participation!.status = command.action === 'request_exit' ? 'exit_requested' : 'active'
    if (command.action === 'gift') view.participation!.gift = command.gift
    return new Response(null, { status: 204 })
  })
  mount(<MemberSanta />)
  const user = userEvent.setup()
  for (const [value, label] of [['ordered', 'Подарок заказан (в пути)'], ['ready', 'Подарок готов'], ['not_ready', 'Нет']]) {
    await user.click(await screen.findByRole('button', { name: label }))
    await waitFor(() => expect(screen.getByRole('button', { name: label }).getAttribute('aria-pressed')).toBe('true'))
    expect(commands.at(-1)).toEqual({ action: 'gift', season_id: 1, gift: value, recipient_id: 2 })
  }
  await user.click(screen.getByRole('button', { name: 'Запросить выход' }))
  expect(screen.getByRole('link', { name: /Открыть профиль/ }).getAttribute('href')).toBe('tg://user?id=222')
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Отправить запрос' }))
  await screen.findByRole('button', { name: 'Отозвать запрос' })
  expect(screen.getByText('Боря: чай')).toBeTruthy()
  await user.click(screen.getByRole('button', { name: 'Отозвать запрос' }))
  await screen.findByRole('button', { name: 'Запросить выход' })
})

it('lets an admin edit a valid permutation before explicit confirmation of the saved revision', async () => {
  const view: AdminView = { season: { ...season }, participants: people, pairs: [] }
  const commands: string[] = []
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    expect(url).toEqual('/api/v1/admin/santa')
    if (init.method !== 'POST') return data(view)
    const cmd = JSON.parse(String(init.body))
    expect(cmd.revision).toBe(view.season.revision)
    commands.push(cmd.action)
    if (cmd.action === 'shuffle') view.pairs = pairs
    if (cmd.action === 'draft') view.pairs = cmd.pairs
    if (cmd.action === 'confirm') view.season.confirmed = true
    view.season.revision++
    return new Response(null, { status: 204 })
  })
  mount(<AdminSanta />)
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: 'Перемешать' }))
  const dialog = within(await screen.findByRole('dialog', { name: 'Черновик жеребьёвки' }))
  expect(dialog.queryByRole('button', { name: /Переместить подопечного/ })).toBeNull()
  await user.click(dialog.getByRole('button', { name: 'Посмотреть и изменить пары' }))
  dialog.getByRole('button', { name: 'Переместить подопечного у Аня' }).focus()
  await user.keyboard('{ArrowDown}')
  await user.click(dialog.getByRole('button', { name: 'Сохранить черновик' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(commands).toEqual(['shuffle', 'draft'])
  await user.click(screen.getByRole('button', { name: 'Подтвердить и разослать' }))
  expect(within(screen.getByRole('dialog')).queryByRole('list')).toBeNull()
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Разослать назначения' }))
  await waitFor(() => expect(screen.queryByRole('heading', { name: 'Жеребьёвка' })).toBeNull())
  expect(screen.getByRole('columnheader', { name: 'Подопечный' })).toBeTruthy()
  expect(commands).toEqual(['shuffle', 'draft', 'confirm'])
})

it.each([false, true])('allows a confirmed season reset only on the local stand (local=%s)', async local => {
  let view: AdminView = { season: { ...season }, participants: people, pairs: [] }
  const resets: unknown[] = []
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (url === '/api/dev/context') return local ? data({ local: true }) : data({ error: 'not_found' }, 404)
    if (url === '/api/v1/member/me') return data({ telegram_id: 1, first_name: 'Аня', is_admin: true })
    if (url === '/api/v1/admin/santa/visibility') return data({ visible: true })
    if (url === '/api/v1/admin/santa' && init?.method !== 'POST') return data(view)
    if (url === '/api/v1/admin/santa/reset' && init?.method === 'POST') {
      resets.push(JSON.parse(String(init.body)))
      view = { season: { ...season, id: 2, status: 'preparation' }, participants: [], pairs: [] }
      return new Response(null, { status: 204 })
    }
    throw new Error(url)
  })
  mount(<MemoryRouter initialEntries={['/admin/santa']}><Routes><Route element={<Layout />}>
    <Route path="/admin/santa" element={<AdminSanta />} />
  </Route></Routes></MemoryRouter>)
  await screen.findByRole('heading', { name: 'Сезон №1' })
  expect(screen.queryByRole('button', { name: 'Завершить сезон' })).toBeNull()
  if (!local) {
    expect(screen.queryByRole('button', { name: 'Сбросить тестовый сезон' })).toBeNull()
    return
  }
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: 'Сбросить тестовый сезон' }))
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Отмена' }))
  expect(resets).toEqual([])
  await user.click(screen.getByRole('button', { name: 'Сбросить тестовый сезон' }))
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Сбросить сезон' }))
  await screen.findByRole('heading', { name: 'Сезон №2' })
  expect(resets).toEqual([{ season_id: 1, revision: 7 }])
  expect(screen.getByText('Заявок пока нет.')).toBeTruthy()
})

it('shows an exit request alongside gift readiness and opens the participant from a table cell', async () => {
  const view: AdminView = { season: { ...season, confirmed: true }, participants: [
    { ...people[0], telegram_id: 123, username: 'test_anya', status: 'exit_requested', gift: 'ready', gift_description: 'Книга о чае' }, ...people.slice(1),
  ], pairs }
  vi.stubGlobal('fetch', async () => data(view))
  mount(<AdminSanta />)
  const user = userEvent.setup()
  const exit = await screen.findByRole('cell', { name: 'Запросил выход' })
  const row = within(exit.closest('tr')!)
  expect(row.getByRole('cell', { name: 'Подарок готов' })).toBeTruthy()
  expect(row.queryByRole('cell', { name: 'Боря' })).toBeNull()
  await user.click(screen.getByRole('button', { name: 'Показать подопечных' }))
  expect(row.getByRole('cell', { name: 'Боря' })).toBeTruthy()
  expect(screen.queryByText('Аня: чай')).toBeNull()
  await user.click(exit)
  const dialog = within(screen.getByRole('dialog', { name: 'Аня' }))
  expect(dialog.getByText('Аня: чай')).toBeTruthy()
  expect(dialog.queryByText('Боря: чай')).toBeNull()
  expect(dialog.getByRole('link', { name: '@test_anya' }).getAttribute('href')).toBe('https://t.me/test_anya')
  expect(dialog.queryByRole('button', { name: 'Подготовленный подарок' })).toBeNull()
  expect(dialog.getByText('Книга о чае')).toBeTruthy()
  expect(dialog.getByText('Подопечный').nextElementSibling?.textContent).toBe('Боря')
  expect(dialog.queryByRole('button', { name: 'Подопечный' })).toBeNull()
})

it('reviews both affected links and allows a two-person exchange after exclusion without a new draw', async () => {
  const view: AdminView = { season: { ...season, confirmed: true }, participants: [
    { ...people[0], gift: 'ready', gift_description: 'Чайник' }, ...people.slice(1),
  ], pairs }
  const writes: unknown[] = []
  vi.stubGlobal('fetch', async (_: string, init: RequestInit) => {
    if (init.method !== 'POST') return data(view)
    writes.push(JSON.parse(String(init.body)))
    return new Response(null, { status: 204 })
  })
  mount(<AdminSanta />)
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: 'Боря' }))
  const person = within(screen.getByRole('dialog', { name: 'Боря' }))
  expect(person.getByText('Боря: чай')).toBeTruthy()
  expect(person.queryByText('Вера: чай')).toBeNull()
  await user.click(person.getByRole('button', { name: 'Исключить участника' }))
  const dialog = within(screen.getByRole('dialog', { name: 'Исключить из обмена: Боря' }))
  expect(dialog.queryByText('Боря: чай')).toBeNull()
  expect(dialog.queryByText('Чайник')).toBeNull()
  await user.click(dialog.getByLabelText('Даритель: Аня'))
  expect(dialog.getByText('Чайник')).toBeTruthy()
  await user.click(dialog.getByLabelText('Пожелания прежнего подопечного: Раньше: Боря'))
  expect(dialog.getByText('Боря: чай')).toBeTruthy()
  expect(dialog.getAllByRole('button', { name: /Переместить подопечного/ })).toHaveLength(2)
  expect(writes).toEqual([])
  await user.click(dialog.getByRole('button', { name: 'Подтвердить исключение' }))
  await waitFor(() => expect(writes).toEqual([{ action: 'exclude', season_id: 1, revision: 7,
    person_id: 2, pairs: [{ giver_id: 1, recipient_id: 3 }, { giver_id: 3, recipient_id: 1 }] }]))
})
