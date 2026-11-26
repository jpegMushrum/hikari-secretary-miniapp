import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import './local-profiles.css'

type Profile = { key: string; name: string }
type Notice = { id: number; text: string; path: string; profile_url?: string }

export function LocalProfiles({ profiles }: { profiles: Profile[] }) {
  const selected = sessionStorage.getItem('hikari.localProfile') ?? 'admin'
  const [open, setOpen] = useState(false)
  const inbox = useQuery<Notice[]>({
    queryKey: ['local-inbox', selected],
    enabled: open,
    refetchInterval: open ? 5000 : false,
    queryFn: async () => {
      const response = await fetch('/api/dev/inbox', { headers: { 'X-Local-Profile': selected } })
      if (!response.ok) throw new Error('Не удалось загрузить уведомления')
      return response.json()
    },
  })
  return <div className="local-profiles">
    <label>Тестовый профиль
      <select value={selected} onChange={e => {
        const key = e.target.value
        sessionStorage.setItem('hikari.localProfile', key)
        const section = window.location.pathname.split('/').includes('mascot') ? 'mascot' : 'santa'
        window.location.assign((key === 'admin' ? '/admin/' : '/') + section)
      }}>{profiles.map(p => <option key={p.key} value={p.key}>{p.name}</option>)}</select>
    </label>
    <button className="text-link" type="button" aria-expanded={open} onClick={() => setOpen(!open)}>Тестовые уведомления</button>
    {open && <div className="local-inbox">
      {inbox.isPending ? 'Загрузка…' : inbox.isError ? 'Не удалось загрузить уведомления' :
        inbox.data.length ? inbox.data.map(n => <p key={n.id}>
          <a href={n.path}>{n.text}</a>
          {n.path === '/admin/santa' && n.profile_url && <a className="text-link local-notice-profile"
            href={n.profile_url} target="_blank" rel="noopener noreferrer">Открыть профиль</a>}
        </p>) : 'Пока пусто'}
    </div>}
  </div>
}
