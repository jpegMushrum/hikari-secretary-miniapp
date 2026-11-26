const moscowDate = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Moscow',
})
const moscowTime = new Intl.DateTimeFormat('ru-RU', {
  hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow',
})

// The API expects the first closed Moscow calendar date. Advance only the
// calendar fields, independently of the time zone of the admin's device.
export function firstClosedDate(lastDay: string) {
  const date = new Date(lastDay + 'T00:00:00Z')
  date.setUTCDate(date.getUTCDate() + 1)
  return date.toISOString().split('T')[0]
}

export function formatLastSubmissionMinute(deadline: string) {
  const last = new Date(Date.parse(deadline) - 1)
  return moscowDate.format(last) + ' в ' + moscowTime.format(last) + ' МСК'
}
