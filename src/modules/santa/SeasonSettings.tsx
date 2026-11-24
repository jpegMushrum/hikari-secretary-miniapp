import { useState } from 'react'
import { MemberModal } from '../member/MemberModal'
import { type Season } from './model'

export type Settings = { budget: string; exchange_at: string; registration_until: string; reminder_minutes: number }

// datetime-local has no zone. The form explicitly uses the club's Moscow time.
function moscowInput(value: string | null) {
  if (!value) return ''
  return new Date(Date.parse(value) + 3 * 3600_000).toISOString().slice(0, 16)
}
export function SeasonSettings({ season, busy, close, save, error }: {
  season: Season; busy: boolean; close: () => void; save: (value: Settings) => void; error?: string
}) {
  const [budget, setBudget] = useState(season.budget)
  const [exchange, setExchange] = useState(moscowInput(season.exchange_at))
  const [until, setUntil] = useState(moscowInput(season.registration_until))
  const [reminder, setReminder] = useState(String(season.reminder_minutes))
  const invalidDates = !!exchange && !!until && until >= exchange
  return <MemberModal title="Настройки сезона" onClose={close} busy={busy}>
    <form className="santa-form" onSubmit={e => {
      e.preventDefault()
      if (invalidDates || !budget.trim()) return
      save({ budget: budget.trim(), exchange_at: new Date(exchange + ':00+03:00').toISOString(),
        registration_until: new Date(until + ':00+03:00').toISOString(), reminder_minutes: Number(reminder) })
    }}>
      <label>Бюджет подарка<input required maxLength={200} value={budget} placeholder="Например, до 1000 ₽"
        onChange={e => setBudget(e.target.value)} /></label>
      <label>Конец записи (МСК)<input type="datetime-local" required value={until} onChange={e => setUntil(e.target.value)} /></label>
      <label>Обмен подарками (МСК)<input type="datetime-local" required value={exchange} onChange={e => setExchange(e.target.value)} /></label>
      {invalidDates && <p role="alert">Запись должна закончиться раньше обмена.</p>}
      <label>За сколько минут до обмена напомнить<input type="number" min={1} max={43200} step={1} required value={reminder}
        onChange={e => setReminder(e.target.value)} /></label>
      {error && <p role="alert">{error}</p>}
      <button className="button primary" disabled={busy || invalidDates || !budget.trim()}>Сохранить настройки</button>
    </form>
  </MemberModal>
}
