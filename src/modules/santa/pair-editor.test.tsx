// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { PairEditor } from './PairEditor'
import type { AdminView, Participant } from './model'

afterEach(cleanup)
function open(recipients: number[], excluded?: number, committed?: number, gift: 'ordered' | 'ready' = 'ready') {
  const participants: Participant[] = recipients.map((_, i) => ({
    person_id: i + 1, name: 'Участник ' + (i + 1), wishes: 'Подарок ' + (i + 1), status: 'active',
    attendance: 'unknown', gift: i + 1 === committed ? gift : 'unknown', gift_description: i + 1 === committed ? 'Подготовлено ' + (i + 1) : '',
    telegram_id: 10000 + i, username: i === 0 ? 'participant_1' : null,
  }))
  const view: AdminView = {
    season: { id: 1, confirmed: !!excluded, status: 'open', budget: '', registration_until: null, exchange_at: null, reminder_minutes: 0, revision: 1 },
    participants, pairs: recipients.map((recipient_id, i) => ({ giver_id: i + 1, recipient_id })),
  }
  const save = vi.fn()
  render(<PairEditor view={view} excluded={participants.find(p => p.person_id === excluded)} save={save} busy={false} close={() => {}} />)
  return save
}

it('rotates three recipients for a keyboard swap that otherwise leaves a self-pair', () => {
  const save = open([2, 3, 1])
  fireEvent.click(screen.getByRole('button', { name: 'Посмотреть и изменить пары' }))
  const original = screen.getByLabelText('Подопечный у Участник 3: Участник 1')
  const giver = screen.getByLabelText('Даритель: Участник 2')
  fireEvent.click(giver)
  fireEvent.click(original)
  expect(original.closest('details')?.open).toBe(true)
  fireEvent.keyDown(screen.getByRole('button', { name: 'Переместить подопечного у Участник 1' }), { key: 'ArrowDown' })
  const recipient = screen.getByLabelText('Подопечный у Участник 3: Участник 2')
  expect(screen.getByLabelText('Подопечный у Участник 2: Участник 1').closest('details')?.open).toBe(true)
  expect(giver.closest('details')?.open).toBe(true)
  expect(recipient.closest('details')?.open).toBe(false)
  fireEvent.click(recipient)
  expect(recipient.closest('details')?.open).toBe(true)
  expect(recipient.closest('details')?.textContent).toContain('Подарок 2')
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить черновик' }))
  expect(save).toHaveBeenCalledWith([{ giver_id: 1, recipient_id: 3 }, { giver_id: 2, recipient_id: 1 }, { giver_id: 3, recipient_id: 2 }])
})

it('drops a recipient on another giver, keeping each recipient unique and giver order fixed', () => {
  const save = open([2, 3, 4, 1])
  fireEvent.click(screen.getByRole('button', { name: 'Посмотреть и изменить пары' }))
  const handle = screen.getByRole('button', { name: 'Переместить подопечного у Участник 1' })
  const destination = screen.getByLabelText('Подопечный у Участник 3: Участник 4')
  Object.defineProperty(handle, 'setPointerCapture', { value: vi.fn() })
  const previous = Object.getOwnPropertyDescriptor(document, 'elementFromPoint')
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => destination })
  try {
    const pointer = { pointerId: 1, isPrimary: true, pointerType: 'touch', button: 0, clientX: 50, clientY: 10 }
    fireEvent.pointerDown(handle, pointer)
    fireEvent.pointerUp(handle, pointer)
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить черновик' }))
    expect(save).toHaveBeenCalledWith([{ giver_id: 1, recipient_id: 4 }, { giver_id: 2, recipient_id: 3 },
      { giver_id: 3, recipient_id: 2 }, { giver_id: 4, recipient_id: 1 }])
  } finally {
    if (previous) Object.defineProperty(document, 'elementFromPoint', previous)
    else Reflect.deleteProperty(document, 'elementFromPoint')
  }
})

it.each(['ordered', 'ready'] as const)('repairs a mutual pair without unnecessarily changing a gift marked %s', gift => {
  const save = open([2, 1, 4, 3], 1, 3, gift)
  expect(screen.getByRole('dialog', { name: 'Исключить из обмена: Участник 1' })).toBeTruthy()
  expect(screen.getByRole('link', { name: '@participant_1' }).getAttribute('href')).toBe('https://t.me/participant_1')
  expect(screen.queryByText('Подготовлено 3')).toBeNull()
  expect(screen.queryByLabelText('Даритель: Участник 2')).toBeNull()
  expect(screen.getAllByText('Участник 2').some(node => node.closest('.santa-person-static'))).toBe(true)
  fireEvent.click(screen.getByLabelText('Даритель: Участник 3'))
  expect(screen.getByText('Подготовлено 3')).toBeTruthy()
  fireEvent.click(screen.getByLabelText('Пожелания прежнего подопечного: Раньше: Участник 1'))
  expect(screen.getByText('Подарок 1')).toBeTruthy()
  expect(screen.getByLabelText('Подопечный у Участник 3: Участник 4')).toBeTruthy()
  expect(screen.getAllByText(/Раньше:/)).toHaveLength(2)
  fireEvent.click(screen.getByRole('button', { name: 'Подтвердить исключение' }))
  expect(save).toHaveBeenCalledWith([{ giver_id: 2, recipient_id: 3 }, { giver_id: 3, recipient_id: 4 }, { giver_id: 4, recipient_id: 2 }])
})

it('blocks removing one of the last two remaining participants', () => {
  open([2, 1], 1)
  expect(screen.getByRole('alert').textContent).toContain('хотя бы два')
  expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Подтвердить исключение' }).disabled).toBe(true)
})
