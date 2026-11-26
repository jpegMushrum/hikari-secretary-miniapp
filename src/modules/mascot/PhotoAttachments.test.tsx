// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EntryForm } from './Entries'
import type { Action, Entry } from './model'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it('previews the selected photo and keeps each AI mark on its attachment when another is removed', async () => {
  const entry: Entry = {
    id: 20, name: 'Лиса', description: 'Лиса с фонариком', approved: false,
    images: [{ key: 'a', ai: false }, { key: 'b', ai: true }, { key: 'c', ai: false }],
  }
  const send = vi.fn(async (_action: Action) => {})
  vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 404 })))
  render(<EntryForm entry={entry} seasonID={1} eligible busy={false} send={send} close={() => {}} />)
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Увеличить изображение 2' }))
  const dialog = screen.getByRole('dialog', { name: 'Изображение 2' })
  expect(within(dialog).getByText('Создано с помощью ИИ')).toBeTruthy()
  await user.click(within(dialog).getByRole('button', { name: 'Закрыть' }))
  await user.click(screen.getByRole('button', { name: 'Убрать изображение 1' }))
  expect((screen.getByRole('checkbox', { name: 'Изображение 1 создано с помощью ИИ' }) as HTMLInputElement).checked).toBe(true)
  await user.click(screen.getByRole('checkbox', { name: 'Изображение 2 создано с помощью ИИ' }))
  await user.click(screen.getByRole('button', { name: 'Сохранить заявку' }))
  expect(send).toHaveBeenCalledWith(expect.objectContaining({ images: [{ key: 'b', ai: true }, { key: 'c', ai: true }] }))
})
