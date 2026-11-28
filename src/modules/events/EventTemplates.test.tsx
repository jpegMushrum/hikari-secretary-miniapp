// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import PublicationDetail from '../publications/PublicationDetail'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const saturday = {
  id: 1,
  revision: 1,
  name: 'Субботние встречи',
  weekday: 6,
  start_time: '17:00',
  end_time: '19:00',
}
const nextDate = { starts_at: '2099-06-06T14:00:00Z', ends_at: '2099-06-06T16:00:00Z' }
const json = (value: unknown) => new Response(JSON.stringify(value))

function mountDraft(templates: (typeof saturday)[], apply = async () => json(nextDate)) {
  const fetcher = vi.fn(async (url: string, options: RequestInit = {}) => {
    const input = options.body ? JSON.parse(String(options.body)) : null
    if (url.endsWith('/publications/7')) {
      return json({
        id: 7,
        status: 'draft',
        text: 'Мой анонс',
        media: [],
        deliveries: [],
        event: null,
      })
    }
    if (url.endsWith('/targets')) return json([])
    if (url.endsWith('/event-templates')) {
      if (options.method === 'POST') {
        const created = { ...input, id: 1, revision: 1 }
        templates.push(created)
        return json(created)
      }
      return json(templates)
    }
    if (url.endsWith('/1/apply')) return apply()
    if (url.endsWith('/1/delete')) {
      expect(input.revision).toBe(templates[0].revision)
      templates.length = 0
      return new Response(null, { status: 204 })
    }
    if (url.endsWith('/event-templates/1') && options.method === 'PUT') {
      expect(input.revision).toBe(templates[0].revision)
      templates[0] = { ...templates[0], ...input, revision: input.revision + 1 }
      return json(templates[0])
    }
    if (url.endsWith('/7/settings')) return json({})
    throw new Error('Unexpected request: ' + url)
  })
  vi.stubGlobal('fetch', fetcher)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/admin/publications/7']}>
        <Routes>
          <Route path="/admin/publications/:id" element={<PublicationDetail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return fetcher
}
const field = (label: string) => screen.getByLabelText<HTMLInputElement>(label)

it('creates and manages a personal schedule inside the draft and saves the manually adjusted date', async () => {
  const fetcher = mountDraft([])
  const user = userEvent.setup()
  await screen.findByText('Мой анонс')
  expect(screen.queryByLabelText('Шаблон')).toBeNull()
  await user.click(screen.getByLabelText('Регистрация на мероприятие'))
  const picker = screen.getByLabelText<HTMLSelectElement>('Шаблон')
  expect(picker.value).toBe('')
  await user.type(field('Название мероприятия'), 'Встреча клуба')
  await user.selectOptions(picker, 'new')
  const dialog = within(screen.getByRole('dialog', { name: 'Новый шаблон' }))
  await user.type(dialog.getByLabelText('Название шаблона'), saturday.name)
  await user.selectOptions(dialog.getByLabelText('День недели'), '6')
  // Native pickers may commit their displayed value only as the form submits.
  dialog.getByLabelText<HTMLInputElement>('Время начала · Москва').value = '17:00'
  dialog.getByLabelText<HTMLInputElement>('Время окончания · Москва').value = '19:00'
  await user.click(dialog.getByRole('button', { name: 'Сохранить шаблон' }))
  await screen.findByRole('option', { name: saturday.name })
  expect(field('Начало · Москва').value).toBe('')
  const create = fetcher.mock.calls.find(
    ([url, init]) => url.endsWith('/event-templates') && init?.method === 'POST',
  )
  expect(JSON.parse(String(create?.[1]?.body))).toEqual({
    name: saturday.name,
    weekday: 6,
    start_time: '17:00',
    end_time: '19:00',
    request_key: expect.any(String),
  })
  await user.selectOptions(picker, '1')
  expect(field('Начало · Москва').value).toBe('2099-06-06T17:00')
  expect(field('Окончание · Москва').value).toBe('2099-06-06T19:00')
  fireEvent.change(field('Начало · Москва'), { target: { value: '2099-06-06T18:15' } })
  await user.click(screen.getByRole('button', { name: 'Редактировать шаблон' }))
  const editDialog = within(screen.getByRole('dialog'))
  await user.clear(editDialog.getByLabelText('Название шаблона'))
  await user.type(editDialog.getByLabelText('Название шаблона'), 'Вечер')
  await user.click(editDialog.getByRole('button', { name: 'Сохранить шаблон' }))
  await screen.findByRole('option', { name: 'Вечер' })
  expect(field('Начало · Москва').value).toBe('2099-06-06T18:15')
  field('Окончание · Москва').value = '2099-06-06T20:30'
  await user.click(screen.getByRole('button', { name: 'Сохранить настройки' }))
  await screen.findByText('Настройки сохранены')
  const saved = fetcher.mock.calls.find(([url]) => url.endsWith('/7/settings'))
  expect(JSON.parse(String(saved?.[1]?.body)).event).toEqual({
    title: 'Встреча клуба',
    starts_at: '2099-06-06T18:15:00+03:00',
    ends_at: '2099-06-06T20:30:00+03:00',
  })
  await user.selectOptions(picker, '1')
  await user.click(screen.getByRole('button', { name: 'Удалить шаблон' }))
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Отмена' }))
  expect(picker.value).toBe('1')
  await user.click(screen.getByRole('button', { name: 'Удалить шаблон' }))
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Удалить' }))
  expect(screen.queryByRole('option', { name: 'Вечер' })).toBeNull()
  expect(field('Окончание · Москва').value).toBe('2099-06-06T19:00')
})

it('preserves manual edits while the selected template is loading', async () => {
  let finish!: (result: Response) => void
  const delayed = new Promise<Response>((resolve) => {
    finish = resolve
  })
  mountDraft([saturday], () => delayed)
  const user = userEvent.setup()
  await user.click(await screen.findByLabelText('Регистрация на мероприятие'))
  await screen.findByRole('option', { name: saturday.name })
  await user.selectOptions(screen.getByLabelText('Шаблон'), '1')
  expect(
    screen.getByRole<HTMLButtonElement>('button', { name: 'Сохранить настройки' }).disabled,
  ).toBe(true)
  fireEvent.change(field('Начало · Москва'), { target: { value: '2099-06-07T15:30' } })
  await act(async () => {
    finish(json(nextDate))
    await delayed
  })
  expect(field('Начало · Москва').value).toBe('2099-06-07T15:30')
  expect(field('Окончание · Москва').value).toBe('')
})
