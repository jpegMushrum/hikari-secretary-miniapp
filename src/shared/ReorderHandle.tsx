import { useEffect, useRef, type PointerEvent } from 'react'
import { GripVertical } from 'lucide-react'
import './column-drag.css'

export function ReorderHandle({
  id,
  label,
  items,
  disabled = false,
  skipId,
  move,
}: {
  id: string
  label: string
  disabled?: boolean
  skipId?: string
  items: string[]
  move: (from: string, to: string) => void
}) {
  const pointer = useRef<number | null>(null)
  const highlight = useRef<HTMLElement | null>(null)
  const frame = useRef<number | null>(null)
  const stopScroll = () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current)
    frame.current = null
  }
  const clear = () => {
    stopScroll()
    highlight.current?.removeAttribute('data-drop-target')
    highlight.current = null
    pointer.current = null
  }
  useEffect(() => clear, [])
  const targetAt = (zone: Element | null, x: number, y: number) => {
    const cell = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-reorder-id]')
    return cell?.closest('[data-reorder-zone]') === zone ? cell : null
  }
  const showTarget = (cell: HTMLElement | null | undefined) => {
    highlight.current?.removeAttribute('data-drop-target')
    highlight.current = cell ?? null
    if (cell && cell.dataset.reorderId !== id) cell.setAttribute('data-drop-target', '')
  }
  const drag = (e: PointerEvent<HTMLButtonElement>) => {
    stopScroll()
    const zone = e.currentTarget.closest<HTMLElement>('[data-reorder-zone]')
    if (!zone) return
    const { clientX: x, clientY: y } = e
    showTarget(targetAt(zone, x, y))
    const rect = zone.getBoundingClientRect()
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return
    const edge = Math.min(36, rect.height / 4)
    const step = y < rect.top + edge ? -8 : y > rect.bottom - edge ? 8 : 0
    if (!step || zone.scrollHeight <= zone.clientHeight) return
    const tick = () => {
      frame.current = null
      const previous = zone.scrollTop
      zone.scrollTop = Math.max(0, Math.min(zone.scrollHeight - zone.clientHeight, previous + step))
      if (previous === zone.scrollTop) return
      showTarget(targetAt(zone, x, y))
      frame.current = requestAnimationFrame(tick)
    }
    frame.current = requestAnimationFrame(tick)
  }
  return (
    <button
      type="button"
      className="column-grip"
      disabled={disabled}
      aria-label={label}
      aria-keyshortcuts="ArrowUp ArrowDown"
      onPointerDown={(e) => {
        if (!e.isPrimary || e.button !== 0) return
        e.preventDefault()
        e.currentTarget.setPointerCapture(e.pointerId)
        pointer.current = e.pointerId
      }}
      onPointerMove={(e) => {
        if (pointer.current !== e.pointerId) return
        drag(e)
      }}
      onPointerUp={(e) => {
        if (pointer.current !== e.pointerId) return
        const zone = e.currentTarget.closest('[data-reorder-zone]')
        const destination = targetAt(zone, e.clientX, e.clientY)?.dataset.reorderId
        clear()
        if (destination && destination !== id) move(id, destination)
      }}
      onPointerCancel={clear}
      onLostPointerCapture={clear}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
        e.preventDefault()
        const step = e.key === 'ArrowUp' ? -1 : 1
        let index = items.indexOf(id) + step
        if (skipId && items[index] === skipId) index += step
        const destination = items[index]
        if (destination) move(id, destination)
      }}
    >
      <GripVertical size={16} aria-hidden="true" />
    </button>
  )
}
