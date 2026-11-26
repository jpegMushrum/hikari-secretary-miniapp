// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import EventsPage from './EventsPage'
import EventDetail from './EventDetail'
import type { EventCard } from './model'

const meeting: EventCard = {
  id: 5,
  title: 'День клуба',
  starts_at: '2026-11-22T15:00:00Z',
  ends_at: '2026-11-22T16:00:00Z',
  status: 'active',
  personal_status: 'not_registered',
  announcement_url: 'https://t.me/example/51',
  announcement: {
    id: 31,
    text: 'Приглашаем друзей клуба!',
    entities: [],
    rich_message: null,
    media: [],
  },
  reminder_options: [60],
  reminder_offset_minutes: null,
  preferred_reminder_offset_minutes: null,
  profile_complete: false,
  can_register: true,
  can_manage_registration: false,
  can_mark_attendance: false,
  can_leave_feedback: false,
}
const json = (value: unknown) => new Response(JSON.stringify(value))
function mount(path: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/events" element={<EventsPage />} />
          <Route path="/events/:id" element={<EventDetail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  localStorage.clear()
})

it('shares the events table layout, limits member filters and keeps the selected list on return', async () => {
  const user = userEvent.setup()
  const fetcher = vi.fn(async (url: string) =>
    url.endsWith('/events/5')
      ? json(meeting)
      : json({
          items: [meeting],
          page: { number: 1, size: 10, total_items: 1, total_pages: 1 },
        }),
  )
  vi.stubGlobal('fetch', fetcher)
  mount('/events')
  expect(screen.getByRole('button', { name: 'Предстоящие' }).getAttribute('aria-pressed')).toBe(
    'true',
  )
  await user.click(screen.getByRole('button', { name: 'Я зарегистрирован' }))
  await waitFor(() =>
    expect(fetcher.mock.calls.some(([url]) => url.includes('view=registered'))).toBe(true),
  )
  expect(screen.queryByRole('button', { name: 'Черновики' })).toBeNull()
  expect(screen.queryByRole('columnheader', { name: 'Посетили' })).toBeNull()
  await user.click(await screen.findByRole('link', { name: /День клуба/ }))
  await screen.findByText('Приглашаем друзей клуба!')
  expect(screen.getByRole('link', { name: /Открыть в Telegram/ }).getAttribute('href')).toBe(
    meeting.announcement_url,
  )
  await user.click(screen.getByRole('link', { name: 'К мероприятиям' }))
  expect(
    screen.getByRole('button', { name: 'Я зарегистрирован' }).getAttribute('aria-pressed'),
  ).toBe('true')
})

it('uses tab-specific start time order until the participant selects a sort', async () => {
  const user = userEvent.setup()
  const queries: URLSearchParams[] = []
  vi.stubGlobal('fetch', async (url: string) => {
    queries.push(new URL(url, 'http://localhost').searchParams)
    return json({ items: [meeting], page: { number: 1, size: 10, total_items: 1, total_pages: 1 } })
  })
  mount('/events')
  const checkQuery = (view: string, sort: string, order: string) =>
    waitFor(() => {
      const query = queries[queries.length - 1]
      expect(query.get('view') || 'upcoming').toBe(view)
      expect(query.get('sort')).toBe(sort)
      expect(query.get('order')).toBe(order)
    })
  await checkQuery('upcoming', 'starts_at', 'asc')
  await user.click(screen.getByRole('button', { name: 'Все встречи' }))
  await checkQuery('all', 'starts_at', 'desc')
  await user.click(screen.getByRole('button', { name: 'Я зарегистрирован' }))
  await checkQuery('registered', 'starts_at', 'asc')
  await user.click(screen.getByRole('button', { name: 'Мероприятие' }))
  await checkQuery('registered', 'title', 'asc')
  await user.click(screen.getByRole('button', { name: 'Все встречи' }))
  await checkQuery('all', 'title', 'asc')
})

it('keeps the chosen reminder through first-registration modal and requires both answers', async () => {
  const user = userEvent.setup()
  let event = { ...meeting }
  const requests: object[] = []
  vi.stubGlobal('fetch', async (url: string, opts: RequestInit) => {
    if (url === '/api/v1/member/profile') {
      if (opts.method === 'PATCH') {
        const body = JSON.parse(String(opts.body))
        requests.push(body)
        event = { ...event, preferred_reminder_offset_minutes: body.reminder_offset_minutes }
        return new Response(null, { status: 204 })
      }
      return json({
        full_name: null,
        is_russian_citizen: null,
        is_itmo_student: null,
        feedback_enabled: true,
      })
    }
    if (url === '/api/v1/member/events/5/registration' && opts.method === 'POST') {
      const request = JSON.parse(String(opts.body))
      requests.push(request)
      event = {
        ...event,
        profile_complete: true,
        personal_status: 'registered',
        can_register: false,
        can_manage_registration: true,
        reminder_offset_minutes: request.reminder_offset_minutes,
      }
      return json({ first_visit_admin_username: 'club_admin' })
    }
    if (url === '/api/v1/member/events/5') return json(event)
    throw new Error(url)
  })
  mount('/events/5')
  const selector = await screen.findByRole<HTMLButtonElement>('combobox', { name: /Уведомление:/ })
  await user.click(selector)
  await user.click(screen.getByRole('option', { name: '1 час' }))
  await waitFor(() => expect(selector.getAttribute('aria-disabled')).toBe('false'))
  expect(requests).toEqual([{ reminder_offset_minutes: 60 }])
  expect(screen.queryByRole('dialog')).toBeNull()
  await user.click(screen.getByRole('button', { name: 'Зарегистрироваться' }))
  let dialog = await screen.findByRole('dialog')
  await user.click(within(dialog).getByRole('button', { name: 'Закрыть' }))
  expect(requests).toHaveLength(1)
  await user.click(screen.getByRole('button', { name: 'Зарегистрироваться' }))
  dialog = await screen.findByRole('dialog')
  await user.type(await within(dialog).findByRole('textbox', { name: 'ФИО' }), 'Анна Клубова')
  const submit = within(dialog).getByRole<HTMLButtonElement>('button', {
    name: 'Сохранить и зарегистрироваться',
  })
  expect(submit.disabled).toBe(true)
  await user.click(
    within(within(dialog).getByRole('group', { name: 'Вы гражданин РФ?' })).getByLabelText('Да'),
  )
  expect(submit.disabled).toBe(true)
  await user.click(
    within(within(dialog).getByRole('group', { name: 'Вы учитесь в ИТМО?' })).getByLabelText('Нет'),
  )
  await user.click(submit)
  await screen.findByText('Зарегистрирован')
  expect(requests).toEqual([
    { reminder_offset_minutes: 60 },
    {
      reminder_offset_minutes: 60,
      profile: { full_name: 'Анна Клубова', is_russian_citizen: true, is_itmo_student: false },
    },
  ])
  const notice = await screen.findByRole('dialog', { name: 'Вы зарегистрированы' })
  expect(within(notice).getByRole('link', { name: '@club_admin' }).getAttribute('href')).toBe(
    'https://t.me/club_admin',
  )
  await user.click(within(notice).getByRole('button', { name: 'Закрыть' }))
  cleanup()
  mount('/events/5')
  await screen.findByText('Зарегистрирован')
  expect(screen.queryByRole('dialog')).toBeNull()
})

it.each([503, 403, 404])('handles a detail refresh returning %s after first registration', async (status) => {
  const user = userEvent.setup()
  let registered = false
  vi.stubGlobal('fetch', async (url: string, opts: RequestInit) => {
    if (url.endsWith('/registration') && opts.method === 'POST') {
      registered = true
      return json({ first_visit_admin_username: 'club_admin' })
    }
    if (url.endsWith('/events/5')) {
      return registered ? new Response(null, { status }) : json({ ...meeting, profile_complete: true })
    }
    throw new Error(url)
  })
  mount('/events/5')
  await user.click(await screen.findByRole('button', { name: 'Зарегистрироваться' }))
  await screen.findByText('Не получилось выполнить действие')
  expect(screen.queryByText(meeting.title)).toBeNull()
  if (status === 503) {
    const notice = await screen.findByRole('dialog', { name: 'Вы зарегистрированы' })
    expect(within(notice).getByRole('link', { name: '@club_admin' })).toBeTruthy()
    await user.click(within(notice).getByRole('button', { name: 'Закрыть' }))
  }
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.getByRole('button', { name: 'Повторить' })).toBeTruthy()
})

it('uses off when the preferred interval is unavailable, then manages the registration in one request per action', async () => {
  const user = userEvent.setup()
  let event = { ...meeting, profile_complete: true, preferred_reminder_offset_minutes: 1440 }
  const requests: unknown[] = []
  vi.stubGlobal('fetch', async (url: string, opts: RequestInit) => {
    if (url === '/api/v1/member/events/5') return json(event)
    if (url !== '/api/v1/member/events/5/registration') throw new Error(url)
    const body = opts.body ? JSON.parse(String(opts.body)) : null
    requests.push([opts.method, body])
    const registered = opts.method !== 'DELETE'
    event = {
      ...event,
      personal_status: registered ? 'registered' : 'not_registered',
      can_register: !registered,
      can_manage_registration: registered,
      reminder_offset_minutes: body?.reminder_offset_minutes ?? null,
    }
    return new Response(null, { status: 204 })
  })
  mount('/events/5')
  const selector = await screen.findByRole<HTMLButtonElement>('combobox', { name: /Уведомление:/ })
  expect(selector.textContent).toContain('Без уведомления')
  await user.click(selector)
  await user.keyboard('{End}{Escape}')
  expect(screen.queryByRole('listbox')).toBeNull()
  expect(requests).toEqual([])
  const register = screen.getByRole('button', { name: 'Зарегистрироваться' })
  const link = screen.getByRole('link', { name: /Открыть в Telegram/ })
  expect(link.compareDocumentPosition(register) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(register.compareDocumentPosition(selector) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  await user.click(register)
  await screen.findByText('Зарегистрирован')
  expect(screen.queryByRole('dialog')).toBeNull()
  await waitFor(() => expect(selector.getAttribute('aria-disabled')).toBe('false'))
  await user.click(selector)
  await user.click(screen.getByRole('option', { name: '1 час' }))
  await waitFor(() => expect(selector.getAttribute('aria-disabled')).toBe('false'))
  expect(selector.textContent).toContain('1 час')
  await user.click(screen.getByRole('button', { name: 'Отменить регистрацию' }))
  await screen.findByText('Не зарегистрирован')
  expect(requests).toEqual([
    ['POST', { reminder_offset_minutes: null }],
    ['PATCH', { reminder_offset_minutes: 60 }],
    ['DELETE', null],
  ])
})

it('loads announcement media in the authenticated member scope using the event ID', async () => {
  const fetcher = vi.fn(async (url: string, opts: RequestInit) => {
    if (url === '/api/v1/member/events/5')
      return json({
        ...meeting,
        announcement: { ...meeting.announcement, media: [{ position: 0 }] },
      })
    if (url === '/api/v1/member/events/5/media/0') {
      expect(new Headers(opts.headers).get('Authorization')).toBe('tma test-identity')
      return new Response(null, { status: 404 })
    }
    throw new Error(url)
  })
  window.Telegram = { WebApp: { initData: 'test-identity' } }
  vi.stubGlobal('fetch', fetcher)
  try {
    mount('/events/5')
    await screen.findByText(/Изображение недоступно/)
    expect(fetcher.mock.calls.some(([url]) => url.includes('/admin/'))).toBe(false)
  } finally {
    delete window.Telegram
  }
})

it('records archive attendance and submits feedback for that specific event', async () => {
  const user = userEvent.setup()
  let event: EventCard = {
    ...meeting,
    status: 'completed',
    can_register: false,
    can_leave_feedback: true,
    can_mark_attendance: true,
    personal_status: 'unmarked',
  }
  const requests: object[] = []
  vi.stubGlobal('fetch', async (url: string, opts: RequestInit) => {
    if (url.endsWith('/attendance') && opts.method === 'PUT') {
      requests.push(JSON.parse(String(opts.body)))
      event = { ...event, can_mark_attendance: false, personal_status: 'missed' }
    } else if (url.endsWith('/feedback') && opts.method === 'POST') {
      requests.push(JSON.parse(String(opts.body)))
    } else if (url.endsWith('/events/5')) return json(event)
    else throw new Error(url)
    return new Response(null, { status: 204 })
  })
  mount('/events/5')
  await user.click(await screen.findByRole('button', { name: 'Нет, не был' }))
  await screen.findByText('Пропустил')
  await user.click(screen.getByRole('button', { name: 'Оставить отзыв' }))
  await user.type(await screen.findByRole('textbox', { name: 'Текст отзыва' }), 'Спасибо!')
  await user.click(screen.getByRole('button', { name: 'Отправить отзыв' }))
  await screen.findByRole('status')
  expect(requests).toEqual([{ attended: false }, { text: 'Спасибо!', event_id: 5 }])
})
