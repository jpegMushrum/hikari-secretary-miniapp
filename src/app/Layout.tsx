import { Suspense, useEffect, useRef, useState } from 'react'
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Menu, Moon, Sun, X, ArrowLeftRight } from 'lucide-react'
import { modules, memberModules } from './modules'
import { hikariRelease, version } from '../../package.json'
import { memberApi, type MemberIdentity } from '../shared/api'
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
    queryKey: ['member', 'me'],
    queryFn: ({ signal }) => memberApi<MemberIdentity>('/me', { signal }),
    retry: false,
  })
  const adminPath = location.pathname === '/admin' || location.pathname.startsWith('/admin/')
  const adminMode = !!me.data?.is_admin && adminPath
  const navigation = adminMode ? modules : memberModules
  const current = navigation.find((m) =>
    (m.roots || [m.path]).some((path) => location.pathname === path || location.pathname.startsWith(path + '/')),
  )
  const home = me.data?.is_admin ? '/admin/events' : '/events'
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
    const back = () => {
      const modal = document.querySelector<HTMLDialogElement>('dialog[open]')
      if (modal) {
        modal.dispatchEvent(new Event('cancel', { cancelable: true }))
        return
      }
      if (window.history.state?.idx > 0) navigate(-1)
      else navigate(current?.path ?? home, { replace: true })
    }
    if (current && ![current.path, current.path + '/'].includes(location.pathname)) {
      tg?.BackButton?.show()
      tg?.BackButton?.onClick(back)
    } else tg?.BackButton?.hide()
    return () => tg?.BackButton?.offClick(back)
  }, [location.pathname, navigate, current, home])
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
  if (me.isPending) return <main className="page-content"><Loading /></main>
  if (me.error) return <main className="page-content"><ErrorState error={me.error} retry={() => void me.refetch()} /></main>
  if (location.pathname === '/' || (adminPath && !adminMode)) return <Navigate to={home} replace />

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
        {adminMode && <div className="navigation-label">УПРАВЛЕНИЕ КЛУБОМ</div>}
        <nav>
          {navigation.map((m) => (
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
          {me.data.is_admin && (
            <Link className="nav-item" to={adminMode ? '/events' : '/admin/events'}>
              <ArrowLeftRight size={20} strokeWidth={1.7} />
              {adminMode ? 'Режим участника' : 'Режим администратора'}
            </Link>
          )}
          <p className="release-caption">
            Hikari Secretary ·{' '}
            <time dateTime={hikariRelease.date}>
              {hikariRelease.date.split('-').reverse().join('.')}
            </time>
            <br />
            Бот {hikariRelease.bot} · Backend {hikariRelease.backend} · Miniapp {version}
          </p>
          <div className="identity">
            <span className="avatar">{me.data?.first_name?.slice(0, 1) || 'H'}</span>
            <div>
              <strong>{me.data?.first_name || 'Hikari'}</strong>
              <small>{adminMode ? 'Администратор' : 'Участник'}</small>
            </div>
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
            <Link className="breadcrumb" to={current?.path ?? home}>
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
            <AdministratorContext.Provider value={me.data.telegram_id}>
              <Suspense fallback={<Loading />}>
                <Outlet />
              </Suspense>
            </AdministratorContext.Provider>
        </main>
      </div>
    </div>
  )
}
