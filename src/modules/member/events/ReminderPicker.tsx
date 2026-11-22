import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { Bell, Check, Menu } from 'lucide-react'
import { reminderLabel } from './model'

type Props = {
  value: number | null
  options: number[]
  disabled: boolean
  onChange: (value: number | null) => void
}

export function ReminderPicker({ value, options, disabled, onChange }: Props) {
  const id = useId()
  const root = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState<number | null>(null)
  const choices = [null, ...options]
  const selected = choices.indexOf(value)
  const open = active !== null && !disabled
  const index = Math.min(active ?? 0, choices.length - 1)

  useLayoutEffect(() => {
    const anchor = root.current
    if (!open || !anchor) return
    const measure = () => {
      const bottom = anchor.getBoundingClientRect().bottom - (window.visualViewport?.offsetTop ?? 0)
      anchor.style.setProperty('--reminder-space', Math.max(anchor.clientHeight, bottom - 8) + 'px')
    }
    measure()
    window.addEventListener('scroll', measure, true)
    window.addEventListener('resize', measure)
    window.visualViewport?.addEventListener('resize', measure)
    return () => {
      window.removeEventListener('scroll', measure, true)
      window.removeEventListener('resize', measure)
      window.visualViewport?.removeEventListener('resize', measure)
    }
  }, [open])

  useLayoutEffect(() => {
    if (!open) return
    const list = document.getElementById(id)
    const option = list?.children[index] as HTMLElement | undefined
    if (!list || !option) return
    if (option.offsetTop < list.scrollTop) list.scrollTop = option.offsetTop
    else if (option.offsetTop + option.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTop = option.offsetTop + option.offsetHeight - list.clientHeight
    }
  }, [id, index, open])

  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setActive(null)
    }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open])

  function choose(option: number | null) {
    setActive(null)
    if (option !== value) onChange(option)
  }

  return (
    <div className="reminder-picker" ref={root}>
      <button
        type="button" role="combobox" className="reminder-toggle"
        aria-label={'Уведомление: ' + reminderLabel(value)} aria-expanded={open}
        aria-controls={id} aria-activedescendant={open ? id + '-' + index : undefined}
        aria-disabled={disabled}
        onBlur={() => setActive(null)}
        onClick={() => { if (!disabled) setActive(open ? null : Math.max(0, selected)) }}
        onKeyDown={(event) => {
          if (disabled) return
          switch (event.key) {
            case 'ArrowDown':
            case 'ArrowUp':
              event.preventDefault()
              setActive(open ? Math.max(0, Math.min(index + (event.key === 'ArrowDown' ? 1 : -1), choices.length - 1)) : Math.max(0, selected))
              break
            case 'Home':
            case 'End':
              if (!open) return
              event.preventDefault()
              setActive(event.key === 'Home' ? 0 : choices.length - 1)
              break
            case 'Escape':
              if (open) { event.preventDefault(); setActive(null) }
              break
            case 'Enter':
            case ' ':
              if (open) { event.preventDefault(); choose(choices[index]) }
              break
          }
        }}
      >
        <Bell size={16} aria-hidden="true" />
        <span>Уведомление</span><span>{reminderLabel(value)}</span>
        <Menu size={16} aria-hidden="true" />
      </button>
      <div role="listbox" aria-label="Уведомление" id={id} hidden={!open}>
        {choices.map((option, i) => (
          <div role="option" key={option ?? 'off'} id={id + '-' + i}
            aria-selected={option === value} data-active={index === i}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => choose(option)}
          >
            {reminderLabel(option)}
            {option === value && <Check size={16} aria-hidden="true" />}
          </div>
        ))}
      </div>
    </div>
  )
}
