import { Suspense, useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Menu, Moon, Sun, X, ArrowUpRight } from 'lucide-react'
import { modules } from './modules'
import { api, type Administrator } from '../shared/api'
import { ErrorState, Loading } from '../shared/components'
import { AdministratorContext } from '../shared/table'

export default function Layout() {
  const [open, setOpen] = useState(false)
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('hikari.theme') === 'light' ? 'light' : 'dark'
    } catch {
      return 'dark'
    }
  })
  const aside = useRef<HTMLElement>(null),
    menuButton = useRef<HTMLButtonElement>(null)
  const location = useLocation(),
    navigate = useNavigate()
  const me = useQuery({
    queryKey: ['me'],
    queryFn: ({ signal }) => api<Administrator>('/me', { signal }),
    retry: false,
  })
  const environment = useQuery({
    queryKey: ['environment'],
    queryFn: async () => {
      try {
        const r = await fetch('/api/dev/context')
        return r.ok ? ((await r.json()) as { local: boolean }) : null
      } catch {
        return null
      }
    },
    staleTime: Infinity,
    retry: false,
  })
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try {
      localStorage.setItem('hikari.theme', theme)
    } catch {}
  }, [theme])
  useEffect(() => {
    setOpen(false)
  }, [location.pathname])
  useEffect(() => {
    const tg = window.Telegram?.WebApp
    tg?.ready?.()
    tg?.expand?.()
    const back = () => navigate(-1)
    if (location.pathname.split('/').length > 3) {
      tg?.BackButton?.show()
      tg?.BackButton?.onClick(back)
    } else tg?.BackButton?.hide()
    return () => tg?.BackButton?.offClick(back)
  }, [location.pathname, navigate])
  useEffect(() => {
    if (!open) return
    document.body.style.overflow = 'hidden'
    const nodes = () => Array.from(aside.current?.querySelectorAll<HTMLElement>('a,button') || [])
    nodes()[0]?.focus()
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        menuButton.current?.focus()
      }
      if (e.key === 'Tab') {
        const n = nodes(),
          first = n[0],
          last = n[n.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last?.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first?.focus()
        }
      }
    }
    document.addEventListener('keydown', key)
    return () => {
      document.body.style.overflow = ''
      document.removeEventListener('keydown', key)
    }
  }, [open])
  const current = modules.find((m) =>
    (m.roots || [m.path]).some((path) => location.pathname.startsWith(path)),
  )
  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">
        К содержимому
      </a>
      {open && (
        <button
          className="drawer-backdrop"
          aria-label="Закрыть меню"
          onClick={() => {
            setOpen(false)
            menuButton.current?.focus()
          }}
        />
      )}
      <aside
        className={'sidebar ' + (open ? 'is-open' : '')}
        ref={aside}
        id="navigation"
        aria-label="Навигация клуба"
      >
        <div className="brand">
          <span className="brand-mark" aria-label="Логотип клуба Hikari">
            光
          </span>
          <div>
            <strong>Hikari</strong>
            <span>японский клуб</span>
          </div>
          <button
            className="icon-button mobile-only"
            aria-label="Закрыть меню"
            onClick={() => {
              setOpen(false)
              menuButton.current?.focus()
            }}
          >
            <X size={21} />
          </button>
        </div>
        <div className="navigation-label">УПРАВЛЕНИЕ КЛУБОМ</div>
        <nav>
          {modules.map((m) => (
            <NavLink
              key={m.id}
              to={m.path}
              className={() => 'nav-item ' + (current?.id === m.id ? 'active' : '')}
            >
              <m.icon size={20} strokeWidth={1.7} />
              <span>{m.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="identity">
            <span className="avatar">{me.data?.first_name?.slice(0, 1) || 'H'}</span>
            <div>
              <strong>{me.data?.first_name || 'Hikari'}</strong>
              <small>Администратор</small>
            </div>
            <ArrowUpRight size={15} className="muted" />
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div>
            <button
              ref={menuButton}
              className="icon-button mobile-only"
              aria-label="Открыть меню"
              aria-controls="navigation"
              aria-expanded={open}
              onClick={() => setOpen(true)}
            >
              <Menu size={22} />
            </button>
            <Link className="breadcrumb" to={current?.path ?? '/admin'}>
              {current?.label || 'Обзор'}
            </Link>
          </div>
          <div>
            {environment.data?.local && (
              <span
                className="dev-label"
                title="Изолированная локальная база с демонстрационными данными"
              >
                Локальный стенд
              </span>
            )}
            <button
              className="icon-button"
              aria-label={theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему'}
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            >
              {theme === 'dark' ? <Sun size={19} /> : <Moon size={19} />}
            </button>
          </div>
        </header>
        <main id="main-content" className="page-content">
          {me.isPending ? (
            <Loading />
          ) : me.error ? (
            <ErrorState error={me.error} retry={() => void me.refetch()} />
          ) : (
            <AdministratorContext.Provider value={me.data.telegram_id}>
              <Suspense fallback={<Loading />}>
                <Outlet />
              </Suspense>
            </AdministratorContext.Provider>
          )}
        </main>
      </div>
    </div>
  )
}
