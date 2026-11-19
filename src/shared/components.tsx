import { AlertCircle, ArrowLeft, RefreshCw, Search } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useEffect, useState, type ReactNode } from 'react'
import { statuses } from './format'

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <header className="page-heading">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action}
    </header>
  )
}
export function ErrorState({ error, retry }: { error: Error; retry?: () => void }) {
  return (
    <div className="notice error" role="alert">
      <AlertCircle size={20} />
      <div>
        <strong>Не получилось выполнить действие</strong>
        <p>{error.message}</p>
        {retry && (
          <button type="button" className="button secondary" onClick={retry}>
            <RefreshCw size={16} />
            Повторить
          </button>
        )}
      </div>
    </div>
  )
}
export function Loading() {
  return (
    <div className="loading" role="status">
      <span className="spinner" />
      Загружаем данные…
    </div>
  )
}
export function Status({
  value,
  label,
  compact = false,
}: {
  value: string
  label?: string
  compact?: boolean
}) {
  const text = label ?? statuses[value] ?? value
  return (
    <span
      className={'status status-' + value}
      role={compact ? 'img' : undefined}
      aria-label={compact ? text : undefined}
      title={compact ? text : undefined}
      tabIndex={compact ? 0 : undefined}
    >
      <span aria-hidden="true" />
      {!compact && text}
    </span>
  )
}
export function BackLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link className="back-link" to={to}>
      <ArrowLeft size={16} />
      {children}
    </Link>
  )
}
export function SearchInput({
  value,
  onChange,
  placeholder = 'Поиск',
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  useEffect(() => {
    if (draft === value) return
    const timer = setTimeout(() => onChange(draft), 350)
    return () => clearTimeout(timer)
  }, [draft, value, onChange])
  return (
    <label className="search">
      <Search size={18} />
      <input
        aria-label={placeholder}
        value={draft}
        maxLength={100}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
      />
    </label>
  )
}
export function SelectFilter({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: [string, string][]
}) {
  return (
    <label className="filter">
      <span>{label}</span>
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
    </label>
  )
}
export const booleanOptions: [string, string][] = [
  ['', 'Все'],
  ['true', 'Да'],
  ['false', 'Нет'],
]
