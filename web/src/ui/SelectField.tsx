import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'

type Option = { value: string; label: string }

export function SelectField({ label, value, options, onChange, disabled, name, className }: {
  label: string
  value: string
  options: Option[]
  onChange: (value: string) => void
  disabled?: boolean
  name?: string
  className?: string
}) {
  const id = useId()
  const button = useRef<HTMLButtonElement>(null)
  const popup = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const selected = Math.max(0, options.findIndex(option => option.value === value))

  useEffect(() => {
    if (!open || !popup.current || !button.current) return
    const rect = button.current.getBoundingClientRect()
    const below = window.innerHeight - rect.bottom
    const above = rect.top
    const menu = popup.current
    const width = Math.min(window.innerWidth - 16, Math.max(rect.width, 225))
    const showAbove = below < 220 && above > below
    Object.assign(menu.style, {
      width: `${width}px`,
      left: `${Math.min(rect.left, window.innerWidth - width - 8)}px`,
      top: showAbove ? 'auto' : `${rect.bottom + 6}px`,
      bottom: showAbove ? `${window.innerHeight - rect.top + 6}px` : 'auto',
      maxHeight: `${Math.max(36, Math.min(300, (showAbove ? above : below) - 12))}px`,
    })
    menu.showPopover()
    menu.focus()
    function outside(event: PointerEvent) {
      if (event.target instanceof Node && !menu.contains(event.target) && !button.current?.contains(event.target)) setOpen(false)
    }
    const close = () => setOpen(false)
    document.addEventListener('pointerdown', outside)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close)
    return () => {
      menu.hidePopover()
      document.removeEventListener('pointerdown', outside)
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', close)
    }
  }, [open])

  useEffect(() => {
    if (open) popup.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [open, active])

  function choose(option: Option | undefined) {
    if (!option) return
    onChange(option.value)
    setOpen(false)
    button.current?.focus()
  }

  function navigate(event: KeyboardEvent<HTMLDivElement>) {
    switch (event.key) {
      case 'ArrowDown': setActive(index => Math.min(options.length - 1, index + 1)); break
      case 'ArrowUp': setActive(index => Math.max(0, index - 1)); break
      case 'Home': setActive(0); break
      case 'End': setActive(options.length - 1); break
      case 'Enter':
      case ' ': choose(options[active]); break
      case 'Escape': setOpen(false); button.current?.focus(); break
      case 'Tab': setOpen(false); button.current?.focus(); return
      default: return
    }
    event.preventDefault()
  }

  return (
    <div className={`select-field ${className ?? ''}`}>
      <span id={id + '-label'}>{label}</span>
      {name && <input type="hidden" name={name} value={value} disabled={disabled} />}
      <button ref={button} type="button" className="secondary select-trigger" disabled={disabled || !options.length}
        aria-labelledby={id + '-label ' + id + '-value'} aria-haspopup="listbox" aria-expanded={open} aria-controls={id}
        onClick={() => { setActive(selected); setOpen(!open) }}
        onKeyDown={event => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            setActive(selected)
            setOpen(true)
          }
        }}>
        <span id={id + '-value'}>{options[selected]?.label}</span><span className="select-chevron" aria-hidden="true" />
      </button>
      <div ref={popup} className="select-popup" id={id} role="listbox" popover="manual" tabIndex={-1}
        aria-labelledby={id + '-label'} aria-activedescendant={open ? id + '-' + active : undefined} onKeyDown={navigate}>
        {options.map((option, index) => <div id={id + '-' + index} key={option.value} role="option" aria-selected={option.value === value}
          data-active={index === active} onPointerMove={() => setActive(index)} onClick={() => choose(option)}>{option.label}</div>)}
      </div>
    </div>
  )
}
