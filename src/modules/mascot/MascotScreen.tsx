import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ErrorState, Loading } from '../../shared/components'
import { ApiError } from '../../shared/api'
import { useMascotView } from './model'
import { Results } from './Results'
import './mascot.css'

export default function MascotScreen() {
  const navigate = useNavigate()
  useEffect(() => {
    const back = () => navigate('/admin/mascot', { replace: true })
    const keyboard = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('dialog[open]')) back()
    }
    const telegramBackAction = () => {
      const dialog = document.querySelector('dialog[open]')
      if (dialog) dialog.dispatchEvent(new Event('cancel', { cancelable: true }))
      else back()
    }
    const telegramBack = window.Telegram?.WebApp?.BackButton
    telegramBack?.show()
    telegramBack?.onClick(telegramBackAction)
    document.addEventListener('keydown', keyboard)
    return () => {
      telegramBack?.offClick(telegramBackAction)
      telegramBack?.hide()
      document.removeEventListener('keydown', keyboard)
    }
  }, [navigate])
  const query = useMascotView('admin')
  if (query.isPending) return <Loading />
  if (query.error && (!query.data || query.error instanceof ApiError && query.error.status < 500)) {
    return <ErrorState error={query.error} retry={() => void query.refetch()} />
  }
  const { season, entries, rounds } = query.data
  return <main className="mascot-screen">
    <Link className="text-link" to="/admin/mascot">К управлению выборами</Link>
    <h1>Выборы маскота</h1>
    {['results', 'published'].includes(season.phase)
      ? <Results key={season.id} scope="admin" seasonID={season.id} winnerID={season.winner_id} rounds={rounds} entries={entries} />
      : <p>Ожидаем итогов голосования.</p>}
  </main>
}
