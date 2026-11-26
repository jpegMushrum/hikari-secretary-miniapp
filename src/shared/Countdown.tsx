import { useEffect, useState, type ReactNode } from 'react'

const minute = 60_000
const day = 24 * 60 * minute
const days = new Intl.NumberFormat('ru', { style: 'unit', unit: 'day', unitDisplay: 'long' })

export function Countdown({ until, label, children }: { until?: string; label: string; children?: ReactNode }) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => setNow(Date.now()), [until])
  const end = until ? Date.parse(until) : 0
  const remaining = end - now
  useEffect(() => {
    if (!(remaining > 0)) return
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

  if (!(remaining > 0)) return children ?? null
  const minutes = Math.min(1439, Math.ceil(remaining / minute))
  const clock = [Math.floor(minutes / 60), minutes % 60].map(n => String(n).padStart(2, '0')).join(':')
  return <small className="season-deadline">{label}: {remaining >= day ? days.format(Math.floor(remaining / day)) : clock}</small>
}
