// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import PeoplePage from './people/PeoplePage'
import PublicationDetail from './publications/PublicationDetail'
import EventDetail from './events/EventDetail'
import EventsPage from './events/EventsPage'
import AIPage from './ai/AIPage'
import { api } from '../shared/api'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  localStorage.clear()
  delete window.Telegram
})
function mount(element: React.ReactNode, route = '/') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path="*" element={element} />
          <Route path="/admin/publications/:id" element={element} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })

it('people table sends server sorting/filtering/pagination and persists column choices', async () => {
  const user = userEvent.setup()
  const fetcher = vi.fn(async (_input: string, _options?: RequestInit) =>
    json({
      items: [
        {
          id: 1,
          full_name: 'Анна Соколова',
          display_name: 'Анна',
          username: 'demo',
          telegram_user_id: 123,
          visits: 4,
          feedback_count: 2,
          last_visit_at: null,
          is_itmo_student: true,
          is_russian_citizen: null,
        },
      ],
      page: { number: 2, size: 10, total_items: 25, total_pages: 3 },
    }),
  )
  vi.stubGlobal('fetch', fetcher)
  mount(<PeoplePage />, '/admin/people?page=2&search=Анна')
  await screen.findByText('Анна Соколова')
  expect(fetcher.mock.calls[0][0]).toContain('page=2')
  await user.click(screen.getByRole('button', { name: 'Посещения' }))
  await waitFor(() => expect(fetcher.mock.calls.at(-1)?.[0]).toContain('sort=visits'))
  expect(fetcher.mock.calls.at(-1)?.[0]).toContain('page=1')
  expect(fetcher.mock.calls.at(-1)?.[0]).toContain('search=')
  await user.selectOptions(screen.getByLabelText('Студент ИТМО'), 'true')
  await waitFor(() => expect(fetcher.mock.calls.at(-1)?.[0]).toContain('is_itmo_student=true'))
  await user.click(screen.getByRole('button', { name: 'Следующая страница' }))
  await waitFor(() => expect(fetcher.mock.calls.at(-1)?.[0]).toContain('page=2'))
  await user.click(screen.getByText('Колонки'))
  await user.click(screen.getByRole('checkbox', { name: 'ИТМО' }))
  expect(
    JSON.parse(localStorage.getItem('hikari.columns.0.Участники') || '{}').is_itmo_student,
  ).toBe(false)
  await user.click(screen.getByRole('button', { name: 'Поднять колонку Посещения' }))
  expect(screen.getAllByRole('columnheader')[0].textContent).toContain('Посещения')
  expect(JSON.parse(localStorage.getItem('hikari.columns.0.Участники.order') || '[]')[0]).toBe(
    'visits',
  )
  await user.click(screen.getByRole('button', { name: 'Сбросить колонки' }))
  expect(screen.getAllByRole('columnheader')[0].textContent).toContain('Участник')
})

it('configures a bot draft without sending original content back, then schedules it', async () => {
  const user = userEvent.setup()
  const publication = {
    id: 77,
    status: 'draft',
    text: 'Исходный анонс',
    entities: [{ type: 'bold', offset: 0, length: 8 }],
    rich_message: null,
    media: [],
    deliveries: [],
    event: null,
  }
  const fetcher = vi.fn(async (input: string, options?: RequestInit) => {
    if (input.endsWith('/targets')) return json([{ key: 'demo', name: 'Демо-канал' }])
    if (input.endsWith('/schedule')) return json({ scheduled: true })
    return json(publication)
  })
  vi.stubGlobal('fetch', fetcher)
  mount(<PublicationDetail />, '/admin/publications/77')
  await screen.findByText('Исходный')
  await user.click(await screen.findByLabelText('Демо-канал'))
  await user.click(screen.getByLabelText('Регистрация на мероприятие'))
  await user.type(screen.getByLabelText('Название мероприятия'), 'Встреча')
  const { fireEvent } = await import('@testing-library/react')
  fireEvent.change(screen.getByLabelText('Начало · Москва'), {
    target: { value: '2099-01-01T18:00' },
  })
  fireEvent.change(screen.getByLabelText('Окончание · Москва'), {
    target: { value: '2099-01-01T20:00' },
  })
  await user.selectOptions(screen.getByLabelText('Когда опубликовать'), 'now')
  await user.click(screen.getByRole('button', { name: 'Подтвердить публикацию' }))
  await screen.findByText('Публикация поставлена в очередь')
  const writes = fetcher.mock.calls.filter(([, opts]) => opts?.method)
  expect(writes.map(([url]) => url)).toEqual([
    '/api/v1/admin/publications/77/settings',
    '/api/v1/admin/publications/77/schedule',
  ])
  expect(JSON.parse(String(writes[0][1]?.body))).toEqual({
    target_keys: ['demo'],
    event: {
      title: 'Встреча',
      starts_at: '2099-01-01T18:00:00+03:00',
      ends_at: '2099-01-01T20:00:00+03:00',
    },
  })
})

it('AI settings remain editable without a provider key', async () => {
  const user = userEvent.setup()
  const fetcher = vi.fn(async (input: string, options?: RequestInit) =>
    input.includes('/history')
      ? json({ items: [], page: { number: 1, size: 10, total_items: 0, total_pages: 0 } })
      : json({
          jlpt_level: options?.method === 'PUT' ? 'N4' : 'N3',
          admin_comment: null,
          enabled: false,
        }),
  )
  vi.stubGlobal('fetch', fetcher)
  mount(<AIPage />)
  await screen.findByText('Генератор не подключён')
  await user.selectOptions(screen.getByLabelText('Уровень японского'), 'N4')
  await user.click(screen.getByRole('button', { name: 'Сохранить настройки' }))
  await screen.findByText('Настройки сохранены')
  expect(fetcher.mock.calls.find(([, options]) => options?.method === 'PUT')?.[1]?.body).toBe(
    JSON.stringify({ jlpt_level: 'N4', admin_comment: null }),
  )
})

it('API forwards Telegram initData when present and reports denied access', async () => {
  window.Telegram = { WebApp: { initData: 'signed-test-data' } }
  const fetcher = vi.fn(async (_input: string, _options?: RequestInit) =>
    json({ error: 'forbidden' }, 403),
  )
  vi.stubGlobal('fetch', fetcher)
  await expect(api('/me')).rejects.toMatchObject({ status: 403, code: 'forbidden' })
  expect((fetcher.mock.calls[0][1] as RequestInit).headers).toBeInstanceOf(Headers)
  expect(((fetcher.mock.calls[0][1] as RequestInit).headers as Headers).get('Authorization')).toBe(
    'tma signed-test-data',
  )
})

it('shows drafts in all meetings and filters them through the workspace endpoint', async () => {
  const user = userEvent.setup()
  const fetcher = vi.fn(async () =>
    json({
      items: [
        {
          id: 4,
          publication_id: 4,
          kind: 'draft',
          title: 'Новый анонс',
          status: 'draft',
          starts_at: null,
          registrations: 0,
          attended: 0,
        },
      ],
      page: { number: 1, size: 10, total_items: 1, total_pages: 1 },
    }),
  )
  vi.stubGlobal('fetch', fetcher)
  mount(<EventsPage />, '/admin/events')
  expect((await screen.findByRole('link', { name: 'Новый анонс' })).getAttribute('href')).toBe(
    '/admin/publications/4',
  )
  expect(screen.getByText('Не задана')).toBeTruthy()
  await user.click(screen.getByRole('button', { name: 'Черновики' }))
  await waitFor(() =>
    expect(String((fetcher.mock.calls as unknown[][]).at(-1)?.[0])).toContain('/event-workspace?'),
  )
  expect(String((fetcher.mock.calls as unknown[][]).at(-1)?.[0])).toContain('status=draft')
})

it('toggles participant column detail and preserves unknown pass data', async () => {
  const user = userEvent.setup()
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      json(
        url.includes('/participants')
          ? {
              items: [
                {
                  person_id: 1,
                  telegram_user_id: 123,
                  full_name: 'Участник проверки',
                  status: 'registered',
                  registered_at: '2026-11-17T10:00:00Z',
                  attended: null,
                  needs_pass: true,
                  is_russian_citizen: null,
                  is_itmo_student: true,
                },
              ],
              page: { number: 1, size: 10, total_items: 1, total_pages: 1 },
            }
          : {
              id: 1,
              title: 'Встреча',
              status: 'active',
              starts_at: '2026-12-01T10:00:00Z',
              ends_at: '2026-12-01T12:00:00Z',
              publication_id: null,
              registrations: 1,
              attended: 0,
              cancelled_registrations: 0,
            },
      ),
    ),
  )
  mount(<EventDetail />)
  await screen.findByText('Участник проверки')
  expect(screen.getByText('Уточнить данные')).toBeTruthy()
  await user.click(screen.getByText('Колонки'))
  await user.click(screen.getByRole('checkbox', { name: 'Статус — только индикатор' }))
  expect(screen.getByRole('img', { name: 'Зарегистрирован' }).getAttribute('title')).toBe(
    'Зарегистрирован',
  )
  expect(screen.queryByRole('checkbox', { name: 'Пропуск — без подробных колонок' })).toBeNull()
  expect(screen.getByRole('columnheader', { name: 'Гражданин РФ' })).toBeTruthy()
  expect(screen.getByRole('columnheader', { name: 'Студент ИТМО' })).toBeTruthy()
  expect(screen.getAllByText('Не указано', { selector: 'td' }).length).toBeGreaterThan(0)
  expect(JSON.parse(localStorage.getItem('hikari.participant-view.0')!)).toEqual({
    compactStatus: true,
  })
  await user.click(screen.getByRole('button', { name: 'Сбросить колонки' }))
  expect(screen.getByRole('columnheader', { name: 'Гражданин РФ' })).toBeTruthy()
  expect(screen.queryByRole('img', { name: 'Зарегистрирован' })).toBeNull()
})
