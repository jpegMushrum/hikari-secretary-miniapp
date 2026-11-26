import { expect, it } from 'vitest'
import { firstClosedDate, formatLastSubmissionMinute } from './deadline'

it.each([
  ['2026-10-31', '2026-11-01'],
  ['2026-11-30', '2026-12-01'],
  ['2026-12-31', '2027-01-01'],
  ['2028-02-29', '2028-03-01'],
])('keeps %s open through the last Moscow minute', (last, closed) => {
  expect(firstClosedDate(last)).toBe(closed)
})

it('displays the last open minute of an existing season using Moscow time', () => {
  expect(formatLastSubmissionMinute('2026-11-30T21:00:00Z')).toMatch(/30 ноября 2026.*в 23:59 МСК/)
})
