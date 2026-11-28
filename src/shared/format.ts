export function moscowInput(raw: string | null | undefined) {
  if (!raw) return ''
  return new Date(new Date(raw).getTime() + 3 * 3600000).toISOString().slice(0, 16)
}

export const dateTime = (value: string | null | undefined) =>
  value
    ? new Intl.DateTimeFormat('ru-RU', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Europe/Moscow',
      }).format(new Date(value))
    : '—'
export const date = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat('ru-RU', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'Europe/Moscow',
      }).format(new Date(value))
    : 'Пока не было'
export const yesNo = (value: boolean | null) =>
  value == null ? 'Не указано' : value ? 'Да' : 'Нет'
export const statuses: Record<string, string> = {
  active: 'Предстоит',
  completed: 'Завершено',
  cancelled: 'Отменено',
  draft: 'Черновик',
  scheduled: 'В очереди',
  sent: 'Опубликовано',
  failed: 'Ошибка',
  pending: 'Ожидает',
  generating: 'Генерируется',
  retry: 'Повтор',
  registered: 'Зарегистрирован',
}
export function positiveInteger(raw: string | null, fallback: number) {
  if (!raw || !/^[1-9]\d*$/.test(raw)) return fallback
  const value = Number(raw)
  return Number.isSafeInteger(value) && value <= 1000000 ? value : fallback
}
