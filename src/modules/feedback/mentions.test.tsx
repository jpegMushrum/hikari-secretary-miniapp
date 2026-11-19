// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import FeedbackPage from './FeedbackPage'
import { TelegramMentions } from '../../shared/TelegramLink'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

it('links individual handles without linking email addresses or URL paths', () => {
  const text =
    'Напишите (@Alice), затем @other_user. Почта person@example.org и https://host/@path.'
  const { container } = render(<TelegramMentions text={text} />)
  expect(container.textContent).toBe(text)
  expect(screen.getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual([
    'https://t.me/Alice',
    'https://t.me/other_user',
  ])
})

it('keeps both destinations accessible when the entire feedback is a mention', async () => {
  vi.stubGlobal(
    'fetch',
    async () =>
      new Response(
        JSON.stringify({
          items: [
            {
              id: 4,
              author_name: '@author',
              text: '@recipient',
              created_at: '2026-11-01T11:00:00Z',
            },
          ],
          page: { total_items: 1, total_pages: 1 },
        }),
      ),
  )
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <FeedbackPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  const recipient = await screen.findByRole('link', { name: '@recipient' })
  const detail = within(recipient.closest('td')!).getByRole('link', { name: 'Открыть отзыв №4' })
  expect(detail.getAttribute('href')).toBe('/admin/feedback/4')
  expect(recipient.getAttribute('href')).toBe('https://t.me/recipient')
  expect(recipient.parentElement?.closest('a')).toBeNull()
  expect(screen.getByRole('link', { name: '@author' }).getAttribute('href')).toBe(
    'https://t.me/author',
  )
})
