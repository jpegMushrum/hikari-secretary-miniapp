import { useEffect, useState } from 'react'
import type { Visibility } from './model'

const minute = 60_000
const day = 24 * 60 * minute
const days = new Intl.NumberFormat('ru', { style: 'unit', unit: 'day', unitDisplay: 'long' })
const exchangeDate = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', timeZone: 'Europe/Moscow' })

export function SeasonDeadline({ season }: { season: Visibility }) {
  const [now, setNow] = useState(Date.now)
  const registrationEnd = season.registration_until ? Date.parse(season.registration_until) : 0
  const registrationOpen = !season.confirmed && registrationEnd > now
  const exchange = season.exchange_at ? Date.parse(season.exchange_at) : 0
  const end = registrationOpen ? registrationEnd : exchange
  const remaining = end - now
  useEffect(() => {
    if (remaining <= 0) return
    // Wake at the next displayed boundary, including the switch just below 24 hours.
    const delay = remaining >= day ? remaining % day + 1 : (remaining % minute || minute)
    const update = () => setNow(Date.now())
    const timer = window.setTimeout(update, delay)
    document.addEventListener('visibilitychange', update)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', update)
    }
  }, [remaining])

  if (remaining <= 0) return season.exchange_at
    ? <small className="season-deadline">Обмен {exchangeDate.format(new Date(season.exchange_at))}</small> : null
  const minutes = Math.min(1439, Math.ceil(remaining / minute))
  const clock = [Math.floor(minutes / 60), minutes % 60].map(n => String(n).padStart(2, '0')).join(':')
  const label = registrationOpen ? 'До конца записи' : 'До итоговой встречи'
  return <small className="season-deadline">{label}: {remaining >= day ? days.format(Math.floor(remaining / day)) : clock}</small>
}
