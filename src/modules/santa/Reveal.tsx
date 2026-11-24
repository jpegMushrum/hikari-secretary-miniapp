import { useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

export function Reveal({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const Icon = open ? ChevronDown : ChevronRight
  return <div className="santa-reveal">
    <button className="text-button" type="button" aria-expanded={open} onClick={() => setOpen(!open)}>
      <Icon size={16} aria-hidden="true" />{label}
    </button>
    {open && children}
  </div>
}
