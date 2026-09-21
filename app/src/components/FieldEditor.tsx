import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Opt } from './opt'

/**
 * The field editor, copied from the reference CRM. One panel for every field:
 *
 *   EDIT FIELD
 *   Funding stage
 *   [ Find an option… ]
 *   ○ Pre-seed          ✓
 *   ● Seed              ✓
 *   [Remove field]           [Cancel] [Save]
 *
 * A closed list gets the option list; a free field gets a text box (or a
 * textarea for a long one). Nothing is written until Save — Cancel and Escape
 * both leave the record alone — and "Remove field" clears the value.
 */
export function FieldEditor({ field, label, value, options, multiline, inputType, onSave, onClose, onRemove, anchorEl }: {
  field: string
  label: string
  value?: string | null
  options?: Opt[]
  multiline?: boolean
  inputType?: string
  onSave: (v: string) => void
  onClose: () => void
  onRemove?: () => void
  /** The element the panel hangs off — the field itself, never the page. */
  anchorEl?: HTMLElement | null
}) {
  const hasOptions = !!options?.length
  const [draft, setDraft] = useState(String(value ?? ''))
  const [q, setQ] = useState('')
  const [pick, setPick] = useState(String(value ?? ''))
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null)
  const panel = useRef<HTMLDivElement>(null)

  const shown = useMemo(() => {
    const list = options ?? []
    return q ? list.filter(o => o.label.toLowerCase().includes(q.toLowerCase())) : list
  }, [options, q])

  // Below the anchor when there is room, above it when there is not.
  useEffect(() => {
    const place = () => {
      const r = anchorEl?.getBoundingClientRect()
      const width = Math.min(330, window.innerWidth - 24)
      const height = Math.min(panel.current?.offsetHeight ?? 380, window.innerHeight - 24)
      // No anchor to hang off: centre it rather than letting it fall to the page top.
      const left = r ? Math.max(12, Math.min(r.left, window.innerWidth - width - 12))
        : Math.max(12, (window.innerWidth - width) / 2)
      const below = r ? r.bottom + 6 : 60
      const top = r && below + height > window.innerHeight - 12 && r.top - height - 6 > 12
        ? r.top - height - 6
        : Math.max(12, Math.min(below, window.innerHeight - height - 12))
      setPos({ left, top, width })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true) }
  }, [shown.length, anchorEl])

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onClose() } }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [onClose])

  const save = () => onSave(hasOptions ? pick : draft)

  return createPortal(
    <>
      <span className="field-editor-backdrop" onClick={onClose} />
      <section ref={panel} className="field-editor" role="dialog" aria-modal="true" aria-label={label}
        style={pos ? { left: pos.left, top: pos.top, width: pos.width } : { visibility: 'hidden' }}>
        <header>
          <div>
            <div className="field-editor-kicker">Edit field</div>
            <h3>{label}</h3>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </header>
        <div className="field-editor-body">
          {hasOptions ? (
            <>
              <div className="field-editor-search">
                <input className="input" autoFocus placeholder="Find an option…" value={q} onChange={e => setQ(e.target.value)} />
              </div>
              <div className="field-option-list">
                <label className={`field-option${pick === '' ? ' on' : ''}`}>
                  <input type="radio" name={`fe-${field}`} value="" checked={pick === ''} onChange={() => setPick('')} />
                  <span>Not provided</span>
                  <span className="fo-check">{pick === '' ? <Tick /> : null}</span>
                </label>
                {shown.map(o => (
                  <label className={`field-option${pick === o.value ? ' on' : ''}`} key={o.value}>
                    <input type="radio" name={`fe-${field}`} value={o.value} checked={pick === o.value} onChange={() => setPick(o.value)} />
                    <span>{o.label}</span>
                    <span className="fo-check">{pick === o.value ? <Tick /> : null}</span>
                  </label>
                ))}
                {shown.length === 0 && <span className="field-option"><span className="faint">No match</span><span /></span>}
              </div>
            </>
          ) : multiline
            ? <textarea className="input field-editor-input" rows={4} autoFocus value={draft} onChange={e => setDraft(e.target.value)} />
            : <input className="input field-editor-input" autoFocus type={inputType ?? 'text'} value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); save() } }} />}
        </div>
        <footer>
          {onRemove && String(value ?? '') !== '' && (
            <button className="btn ghost danger" onClick={onRemove}>Remove field</button>
          )}
          <span className="field-editor-spacer" />
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn accent" onClick={save}>Save</button>
        </footer>
      </section>
    </>,
    document.body,
  )
}

function Tick() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M5 12l4 4L19 6" /></svg>
}
