import { describe, expect, it } from 'vitest'
import { dateTime, positiveInteger, yesNo } from './format'

describe('table input and display', () => {
  it('rejects malformed, unsafe and excessive page numbers', () => {
    for (const value of [null, '', '0', '-1', '2x', '1.5', '1000001', '9999999999999999'])
      expect(positiveInteger(value, 1)).toBe(1)
    expect(positiveInteger('12', 1)).toBe(12)
  })
  it('keeps unknown profile values distinct from no', () => {
    expect(yesNo(null)).toBe('Не указано')
    expect(yesNo(false)).toBe('Нет')
    expect(yesNo(true)).toBe('Да')
  })
  it('formats date/time in Moscow independently of browser timezone', () => {
    expect(dateTime('2026-01-01T23:30:00Z')).toContain('02:30')
    expect(dateTime('2026-01-01T23:30:00Z')).toContain('2 янв.')
    expect(dateTime(null)).toBe('—')
  })
})
