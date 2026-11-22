// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import Layout from '../../app/Layout'
import { type MemberProfile } from '../../shared/api'
import ProfilePage from './ProfilePage'
import FeedbackPage from './FeedbackPage'

const json = (value: unknown) => new Response(JSON.stringify(value))
const saved = () => new Response(null, { status: 204 })

function mount(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}>
      <Routes><Route element={<Layout />}>
        <Route index element={null} />
        <Route path="/events" element={<h1>Список встреч участника</h1>} />
        <Route path="/admin/events" element={<h1>Администрирование встреч</h1>} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/feedback" element={<FeedbackPage />} />
      </Route></Routes>
    </MemoryRouter></QueryClientProvider>,
  )
}
function apiAs(isAdmin: boolean, respond?: (url: string, options: RequestInit) => Response | Promise<Response>) {
  vi.stubGlobal('fetch', async (url: string, options: RequestInit = {}) => {
    if (url === '/api/v1/member/me') return json({ telegram_id: 1, first_name: 'Ирина', is_admin: isAdmin })
    if (url === '/api/dev/context') return json({local: true})
    if (respond) return respond(url, options)
    throw new Error('Unexpected request: ' + url)
  })
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear() })

it('opens the admin homepage for admins and switches to the same identity in participant mode', async () => {
  apiAs(true)
  mount('/')
  await screen.findByRole('heading', { name: 'Администрирование встреч' })
  const user = userEvent.setup()
  await user.click(screen.getByRole('link', { name: 'Режим участника' }))
  await screen.findByRole('heading', { name: 'Список встреч участника' })
  expect(screen.getByRole('link', { name: 'Мой профиль' }).getAttribute('href')).toBe('/profile')
  await user.click(screen.getByRole('link', { name: 'Режим администратора' }))
  await screen.findByRole('heading', { name: 'Администрирование встреч' })
})

it('redirects a participant opening an admin deep link and only shows participant navigation', async () => {
  apiAs(false)
  mount('/admin/events')
  await screen.findByRole('heading', { name: 'Список встреч участника' })
  expect(screen.queryByRole('link', { name: 'ИИ' })).toBeNull()
  expect(screen.queryByRole('link', { name: 'Режим администратора' })).toBeNull()
})

it('saves notification preference on an empty profile and explicitly saves the two profile flags', async () => {
  let profile: MemberProfile = { full_name: null, is_itmo_student: null, is_russian_citizen: null, feedback_enabled: true }
  const writes: [string, unknown][] = []
  apiAs(false, (url, opts) => {
    if (url !== '/api/v1/member/profile') throw new Error(url)
    if (!opts.method) return json(profile)
    const body = JSON.parse(String(opts.body))
    writes.push([opts.method, body])
    profile = { ...profile, ...body }
    return saved()
  })
  mount('/profile')
  const user = userEvent.setup()
  const toggle = await screen.findByRole('switch')
  await user.click(toggle)
  await screen.findByText('Выключено')
  await user.type(screen.getByRole('textbox', { name: 'ФИО' }), 'Ирина Иванова')
  await user.click(screen.getByRole('checkbox', { name: 'Я гражданин РФ' }))
  await user.click(screen.getByRole('button', { name: 'Сохранить профиль' }))
  await screen.findByText('Профиль сохранён')
  expect(writes).toEqual([
    ['PATCH', { feedback_enabled: false }],
    ['PUT', { full_name: 'Ирина Иванова', is_itmo_student: false, is_russian_citizen: true }],
  ])
})

it('sends general feedback and only deletes the selected review after confirmation', async () => {
  let items = [{ id: 9, text: 'Старая запись', event_id: null, event_title: null, created_at: '2026-11-22T09:00:00Z' }]
  const writes: string[] = []
  let finishSend!: (response: Response) => void
  apiAs(false, (url, opts) => {
    if (url.startsWith('/api/v1/member/feedback?'))
      return json({ items, page: { number: 1, size: 10, total_items: items.length, total_pages: 1 } })
    if (url === '/api/v1/member/feedback' && opts.method === 'POST') {
      const body = JSON.parse(String(opts.body))
      expect(body).toEqual({ text: 'Отзыв о клубе' })
      items = [{ ...items[0], id: 10, text: body.text }, ...items]
      writes.push('create')
      return new Promise<Response>(resolve => { finishSend = resolve })
    }
    if (url === '/api/v1/member/feedback/10' && opts.method === 'DELETE') {
      items = items.filter(i => i.id !== 10)
      writes.push('delete')
      return saved()
    }
    throw new Error(url)
  })
  mount('/feedback')
  await screen.findByText('Старая запись')
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Оставить отзыв' }))
  let dialog = await screen.findByRole('dialog')
  await user.type(within(dialog).getByRole('textbox'), 'Отзыв о клубе')
  await user.click(within(dialog).getByRole('button', { name: 'Отправить отзыв' }))
  const close = within(dialog).getByRole<HTMLButtonElement>('button', { name: 'Закрыть' })
  expect(close.disabled).toBe(true)
  await user.click(close)
  dialog.dispatchEvent(new Event('cancel', { cancelable: true }))
  expect(screen.getByRole('dialog')).toBe(dialog)
  finishSend(saved())
  await screen.findByText('Отзыв отправлен.')
  const row = (await screen.findByText('Отзыв о клубе')).closest('li')!
  await user.click(within(row).getByRole('button', { name: 'Удалить отзыв' }))
  dialog = await screen.findByRole('dialog', { name: 'Вы уверены, что хотите удалить отзыв?' })
  await user.click(within(dialog).getByRole('button', { name: 'Оставить' }))
  expect(writes).toEqual(['create'])
  await user.click(within(row).getByRole('button', { name: 'Удалить отзыв' }))
  dialog = await screen.findByRole('dialog')
  await user.click(within(dialog).getByRole('button', { name: 'Удалить' }))
  await screen.findByText('Отзыв удалён.')
  expect(writes).toEqual(['create', 'delete'])
  expect(screen.queryByText('Отзыв о клубе')).toBeNull()
  expect(screen.getByText('Старая запись')).toBeTruthy()
})
