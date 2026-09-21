import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { NavLink } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import { RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer } from 'recharts'
import { useCreateRecord, useLiveRecords } from 'lemma-sdk/react'
import { lemmaClient } from './lemma-client'
import { domainOf, initials, provenanceLine, SELECT_FIELDS, optionLabel, fieldLabel, cleanProfileText } from './lib'
import { FieldEditor } from './components/FieldEditor'
import type { Opt } from './components/opt'

/* ------------------------------------------------------------------ marks */
/**
 * Company mark. Resolution cascade: stored logo_url -> Clearbit logo for the
 * company domain -> Google favicon -> initials on a tinted square.
 */
export function Logo({ name, url, website, size }: { name?: string; url?: string | null; website?: string | null; size?: 'row' | 'card' | 'lg' }) {
  const sources = useMemo(() => {
    const s: string[] = []
    if (url) s.push(url)
    const d = domainOf(website)
    if (d) s.push(`https://www.google.com/s2/favicons?domain=${d}&sz=128`)
    return s
  }, [url, website])
  const [idx, setIdx] = useState(0)
  const cls = size === 'lg' ? 'av-lg' : size === 'row' ? 'row-logo' : 'mono-av'
  const failed = idx >= sources.length
  return (
    <span className={`logo-wrap ${cls}`}>
      <span className="avatar-fallback">{initials(name)}</span>
      {!failed && sources[idx] && (
        <img className="logo-img" src={sources[idx]} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setIdx(i => i + 1)} />
      )}
    </span>
  )
}

/** Person mark — initials on a tinted circle, photo when the profile carries one. */
export function PersonMark({ name, photo, size }: { name?: string; photo?: string | null; size?: 'row' | 'card' | 'lg' }) {
  const cls = size === 'lg' ? 'av-lg' : size === 'card' ? 'row-dp' : 'row-logo'
  return (
    <span className={`logo-wrap ${cls}`}>
      <span className="avatar-fallback">{initials(name)}</span>
      {photo && <img className="logo-img" src={photo} alt="" loading="lazy" referrerPolicy="no-referrer" onError={e => (e.currentTarget as HTMLImageElement).remove()} />}
    </span>
  )
}

/* --------------------------------------------------------------- controls */
export function Score({ value, full }: { value?: number | null; full?: boolean }) {
  if (value == null) return <span className="score">—</span>
  const cls = value >= 75 ? 'hi' : value >= 55 ? 'mid' : ''
  return <span className={`score${full ? ' full' : ''} ${cls}`}>{value}</span>
}

export function TypeLabel({ children, update }: { children: React.ReactNode; update?: boolean }) {
  return <span className={`type-label${update ? ' update' : ''}`}>{children}</span>
}

export function Spinner({ label }: { label?: string }) {
  return <span className="chat-thinking"><span className="spinner" />{label}</span>
}

export function Md({ children, className }: { children: string; className?: string }) {
  return (
    <div className={className}>
      <ReactMarkdown components={{
        a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer">{children}</a>,
      }}>{children}</ReactMarkdown>
    </div>
  )
}

export function Radar5({ radar }: { radar?: Record<string, number> | null }) {
  if (!radar) return null
  const entries = Object.entries(radar)
  const data = entries.map(([k, v]) => ({ dim: k, v }))
  return (
    <div className="radar card">
      <div style={{ width: 208, height: 168, flex: '0 0 208px' }}>
        <ResponsiveContainer>
          <RadarChart data={data} outerRadius={56} cx="50%" cy="50%">
            <PolarGrid stroke="#ddd8cb" />
            <PolarAngleAxis dataKey="dim" tick={{ fontSize: 10, fill: '#8b8779', fontFamily: 'Inter' }} />
            <Radar dataKey="v" stroke="#5b3fd1" fill="#5b3fd1" fillOpacity={0.13} strokeWidth={1.6} dot={false} isAnimationActive={false} />
          </RadarChart>
        </ResponsiveContainer>
      </div>
      <div className="radar-nums">
        {entries.map(([k, v]) => (
          <div className="radar-num" key={k}>
            <span className="rn-label">{k}</span>
            <span className="bar"><i style={{ width: `${(v / 5) * 100}%` }} /></span>
            <span className="rn-val">{Number(v).toFixed(1)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------- app shell */
const Icon = ({ d }: { d: string }) => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{d.split('|').map((p, i) => <path key={i} d={p} />)}</svg>
)

export const NAV = [
  { to: '/', end: true, label: 'Inbox', icon: Icon({ d: 'M4 13h4l2 3h4l2-3h4|M5 5h14l2 8v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4z' }) },
  { to: '/pipeline', label: 'Pipeline', icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="5" height="16" rx="1" /><rect x="10" y="4" width="5" height="10" rx="1" /><rect x="17" y="4" width="4" height="13" rx="1" /></svg> },
  { to: '/people', label: 'People', icon: Icon({ d: 'M9 8a3 3 0 1 0 0 6 3 3 0 0 0 0-6z|M3 20a6 6 0 0 1 12 0|M16 5a3 3 0 0 1 0 6|M18.5 20a5 5 0 0 0-2-4' }) },
  { to: '/thesis', label: 'Thesis', icon: Icon({ d: 'M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z|M8 7h8|M8 11h6' }) },
]

export function Rail({ counts, foot }: { counts: Record<string, number>; foot?: string }) {
  // The fund's own mark sits with the wordmark, so the pod reads as theirs from
  // the first screen. Read from the thesis row — no logo is stored, it comes off
  // the fund's domain, falling back to initials.
  const thesis = useLiveRecords<Record<string, any>>({
    client: lemmaClient, podId: lemmaClient.podId, tableName: 'thesis', limit: 1,
  })
  const fund = (thesis.records ?? [])[0]
  const fundName = String(fund?.fund_name ?? '')
  return (
    <nav className="rail">
      <div className="railbrand">
        {fundName && <Logo name={fundName} website={String(fund?.website ?? '')} size="row" />}
        <div className="wordmark">VC <em>Analyst</em></div>
      </div>
      <div className="railsub">{fundName || 'DEAL FLOW'}</div>
      {NAV.map(n => (
        <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `nav${isActive ? ' on' : ''}`}>
          {n.icon}<span>{n.label}</span>
          {counts[n.label] ? <span className="ct">{counts[n.label]}</span> : null}
        </NavLink>
      ))}
      <div className="railend">
        <NavLink to="/settings" className={({ isActive }) => `gear${isActive ? ' on' : ''}`} title="Settings" aria-label="Settings">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2 2 2 0 0 1-4 0 1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 0 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 15a2 2 0 0 1 0-4 1.7 1.7 0 0 0 1.5-2.9l-.1-.1a2 2 0 0 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 4.6a2 2 0 0 1 4 0 1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 0 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 21 11a2 2 0 0 1 0 4z" />
          </svg>
        </NavLink>
        <div className="railfoot">{foot}</div>
      </div>
    </nav>
  )
}

/* ----------------------------------------------------------------- sheet */
/** The theme's slide-over. Used for "Add a deal" and for confirming a stage move. */
export function Sheet({ title, sub, onClose, children, footer }: {
  title: string; sub?: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode
}) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [onClose])
  // The panel lives INSIDE the scrim, exactly as the reference app builds it.
  // As siblings, the scrim's `z-index:100` paints over the panel (which has no
  // z-index of its own), so the sheet was visible but every click on it landed
  // on the scrim and closed it instead of pressing a button.
  return (
    <div className="sheet-scrim" onClick={onClose}>
      <aside className="form-sheet" role="dialog" aria-modal="true" aria-label={title}
        onClick={e => e.stopPropagation()}>
        <header className="sheet-head">
          <div><h2>{title}</h2>{sub && <p>{sub}</p>}</div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </header>
        <div className="sheet-body">{children}</div>
        {footer && <footer className="sheet-foot">{footer}</footer>}
      </aside>
    </div>
  )
}

/* ------------------------------------------------ closed lists (one source) */
export type { Opt }

/**
 * Every closed list in the UI comes from the pod's `field_options` table (the
 * same list intake validates against), falling back to the built-in lists so a
 * picker is never empty. One hook, so a list is edited in one place.
 */
export function useFieldOptions(): Record<string, Opt[]> {
  const q = useLiveRecords<Record<string, any>>({
    client: lemmaClient, podId: lemmaClient.podId, tableName: 'field_options', limit: 300,
  })
  return useMemo(() => {
    const map: Record<string, Opt[]> = {}
    for (const r of q.records ?? []) {
      if (r.active === false) continue
      const f = String(r.field_name ?? '')
      if (!f) continue
      ;(map[f] ??= []).push({ value: String(r.value), label: optionLabel(f, String(r.value)) })
    }
    for (const [f, opts] of Object.entries(SELECT_FIELDS)) if (!map[f]?.length) map[f] = opts
    return map
  }, [q.records])
}


/* ------------------------------------------------------------ source mark */
/**
 * Where a deal came from, drawn the way the reference app draws it: a 15px
 * tinted square holding a stroked line icon, with the word beside it when the
 * row has space for one. Never a filled brand logo — it read as a sticker.
 */
export function SourceIcon({ kind, word }: { kind: string; word?: boolean }) {
  const paths: Record<string, React.ReactNode> = {
    email: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m4 7 8 6 8-6" /></>,
    whatsapp: <><path d="M20 11.5a8 8 0 0 1-11.8 7L4 20l1.5-4.1A8 8 0 1 1 20 11.5z" /><path d="M9 8.5c.7 2.4 2.1 3.8 4.5 4.5" /></>,
    deck: <><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v5h5M9 13h6M9 17h5" /></>,
    manual: <><path d="M12 4v16M4 12h16" /></>,
  }
  const label = kind === 'whatsapp' ? 'WhatsApp' : kind === 'email' ? 'Email' : kind === 'deck' ? 'Deck' : 'Added by hand'
  return (
    <span className="source">
      <span className={`source-icon ${kind}`} aria-hidden="true">
        <svg viewBox="0 0 24 24">{paths[kind] ?? paths.manual}</svg>
      </span>
      {word && <span className="source-word">{label}</span>}
    </span>
  )
}

/* --------------------------------------------------------------- files */
/**
 * A stored file on the deal — today the deck. The value in the table is a path;
 * what a person wants is the document, so the row offers the file's name and
 * opens it in a new tab (a short signed URL, minted on the click).
 */
export function FileLink({ path, label }: { path: string; label?: string }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(false)
  const name = path.split('/').pop() ?? path
  const open = async () => {
    setBusy(true); setErr(false)
    try {
      const url = await lemmaClient.files.createSignedUrl(path, { expiresSeconds: 3600, maxHits: 5 })
      const href = (url as any).url ?? (url as any).signed_url
      if (href) window.open(href, '_blank', 'noopener')
      else setErr(true)
    } catch { setErr(true) } finally { setBusy(false) }
  }
  return (
    <button className="file-link" onClick={open} disabled={busy} title={path}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v5h5" /></svg>
      <span className="fl-name">{label ?? name}</span>
      <span className="fl-open">{busy ? 'opening…' : err ? 'could not open' : 'open ↗'}</span>
    </button>
  )
}

/* ------------------------------------------------------- editable value */
/**
 * A value on the deal, editable in place. **One click opens the editor** — no
 * hidden double-click — and the affordance is visible before you touch it.
 * A field with a closed list (`options`) opens a picker, never a text box.
 * Enter or blur saves, Escape cancels, and every human edit is logged as a
 * provenance row so a value always traces back to whoever or whatever wrote it.
 */
export function Editable({ dealId, field, value, options, placeholder, multiline, inputType, source, hint, onSaved, className, display, first }: {
  dealId: string
  field: string
  value?: string | null
  options?: Opt[]
  placeholder?: string
  multiline?: boolean
  inputType?: string
  source?: string | null
  hint?: boolean
  onSaved?: () => void
  className?: string
  /** Text to show instead of the raw value — used for id-backed fields like the owner contact. */
  display?: string | null
  /** Rendered larger — used for the company name and the one-liner. */
  first?: 'h1' | 'lead'
}) {
  const src = useCreateRecord({ client: lemmaClient, podId: lemmaClient.podId, tableName: 'field_sources' })
  const wrap = useRef<HTMLSpanElement>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(value ?? ''))
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (!editing) setDraft(String(value ?? '')) }, [value, editing])

  const write = async (next: string) => {
    setEditing(false)
    if (next === String(value ?? '').trim()) return
    setBusy(true)
    try {
      await lemmaClient.records.update('deals', dealId, { [field]: next || null } as any)
      if (next) await src.create({ deal_id: dealId, field_name: field, value: next, source_class: 'human', written_by: 'you', evidence_note: 'edited in the CRM' } as any)
      onSaved?.()
    } finally { setBusy(false) }
  }
  const commit = () => write(draft.trim())

  const prov = provenanceLine(source)
  const optionText = options?.length ? optionLabel(field, value as string) : null
  const shown = display ?? (inputType === 'date' && value ? String(value).slice(0, 10) : (optionText ?? value))
  const cls = `ed-wrap${busy ? ' busy' : ''}${className ? ' ' + className : ''}`

  if (editing) {
    return (
      <span className={cls} ref={wrap}>
        <FieldEditor field={field} label={fieldLabel(field)} value={value} options={options}
          multiline={multiline} inputType={inputType} anchorEl={wrap.current}
          onSave={v => write(v)} onRemove={() => write('')} onClose={() => setEditing(false)} />
      </span>
    )
  }

  const Tag: any = first === 'h1' ? 'h1' : 'div'
  return (
    <span className={cls} ref={wrap}>
      <Tag className={`ed${first ? ' ed-' + first : ''}`}>
        <button type="button" className={`ed-value${shown ? '' : ' none'}`} onClick={() => setEditing(true)}
          title={`Click to edit${prov ? ` — currently ${prov}` : ''}`}>
          {shown || 'not set'}
        </button>
      </Tag>
      {hint && prov && <span className="ed-prov">{prov}</span>}
    </span>
  )
}


/* ------------------------------------------------------- closed lists */
/**
 * A closed list is picked from a floating panel, never the browser's own
 * `select` — same shape as the reference app: hairline panel, one row per
 * option, the value in force carrying a tick.
 */
export function OptionPopover({ options, value, onPick, onClose, title, anchorEl }: {
  options: Opt[]
  value?: string | null
  onPick: (v: string) => void
  onClose: () => void
  title?: string
  /** The control the list hangs off, so it opens under the button you pressed. */
  anchorEl?: HTMLElement | null
}) {
  const [q, setQ] = useState('')
  const many = options.length > 8
  const shown = q ? options.filter(o => o.label.toLowerCase().includes(q.toLowerCase())) : options
  const on = String(value ?? '')
  const panel = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null)

  useEffect(() => {
    const place = () => {
      const r = anchorEl?.getBoundingClientRect()
      const width = Math.min(300, window.innerWidth - 24)
      const height = Math.min(panel.current?.offsetHeight ?? 360, window.innerHeight - 24)
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
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [onClose])

  return createPortal(
    <>
      <span className="field-editor-backdrop" onClick={onClose} />
      <div ref={panel} className="field-editor" role="listbox" onClick={e => e.stopPropagation()}
        style={pos ? { left: pos.left, top: pos.top, width: pos.width } : { visibility: 'hidden' }}>
        {title && <header><h3>{title}</h3></header>}
        {many && (
          <div className="field-editor-search">
            <input className="input" autoFocus placeholder="Search…" value={q} onChange={e => setQ(e.target.value)}
              onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); onClose() } }} />
          </div>
        )}
        <div className="field-editor-body">
          <div className="field-option-list">
            {shown.map(o => (
              <button type="button" key={o.value} role="option" aria-selected={on === o.value}
                className={`field-option${on === o.value ? ' on' : ''}`} onClick={() => onPick(o.value)}>
                <span>{o.label}</span>
                <span className="fo-check">{on === o.value ? <CheckIcon /> : null}</span>
              </button>
            ))}
            {shown.length === 0 && <span className="field-option"><span className="faint">No match</span><span /></span>}
          </div>
        </div>
        {on && <footer><button type="button" className="btn sm ghost" onClick={() => onPick('')}>Clear</button></footer>}
      </div>
    </>,
    document.body,
  )
}

/** Alias kept for older call sites. */
export const EditableField = Editable

/* ----------------------------------------------------------------- stage */
export function StagePill({ id, label }: { id?: string | null; label: string }) {
  return <span className={`stage-pill s-${id ?? 'none'}`}><span className="sp-dot" />{label}</span>
}

/* ------------------------------------------------------------ people table */
export type PersonRow = Record<string, any>

/**
 * People as a full-width table — one person per row, so the page reads as the
 * page and not as a floating card. Photo, name and headline, company, role,
 * the deal they came in with, LinkedIn, email, last touch.
 */
export function PeopleTable({ rows, dealById, lastTouch, onOpen }: {
  rows: PersonRow[]
  dealById: Record<string, any>
  lastTouch?: Record<string, string>
  onOpen: (id: string) => void
}) {
  const showTouch = !!lastTouch
  return (
    <div className="pt-wrap">
      <table className={`pt${showTouch ? '' : ' pt-no-touch'}`}>
        <thead>
          <tr>
            <th className="pt-person">Name</th>
            <th>Role</th>
            <th>Deal</th>
            <th className="pt-narrow">in</th>
            <th>Email</th>
            {showTouch && <th className="pt-narrow">Touch</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map(c => {
            const rp = (c.raw_profile ?? {}) as Record<string, any>
            const photo = c.photo_url ?? rp.profilePic ?? rp.profilePicture ?? rp.profile_pic ?? rp.avatar ?? null
            const deal = c.deal_id ? dealById[c.deal_id] : undefined
            const headline = c.headline ?? rp.headline ?? rp.current_title ?? null
            return (
              <tr key={c.id} className="pt-row" onClick={() => onOpen(c.id)} tabIndex={0}
                onKeyDown={e => { if (e.key === 'Enter') onOpen(c.id) }}>
                <td className="pt-person">
                  <PersonMark name={c.name} photo={photo} size="card" />
                  <span className="pt-id">
                    <span className="pt-name">{c.name ?? 'Unknown'}</span>
                    {headline && String(headline) !== String(deal?.company_name ?? '') &&
                      <span className="pt-headline" title={cleanProfileText(headline)}>{cleanProfileText(headline)}</span>}
                  </span>
                </td>
                <td className="pt-cell">{c.role ? String(c.role).replace(/_/g, ' ') : <span className="faint">—</span>}</td>
                <td className="pt-cell">
                  {deal
                    ? <a className="pt-deal" href={`#/deal/${deal.id}`} onClick={e => { e.stopPropagation(); }}>{deal.company_name}</a>
                    : <span className="faint">—</span>}
                </td>
                <td className="pt-narrow">
                  {c.linkedin_url
                    ? <a className="pt-link" href={String(c.linkedin_url)} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} title={String(c.linkedin_url)}>in ↗</a>
                    : <span className="faint">—</span>}
                </td>
                <td className="pt-cell pt-email">
                  {c.email
                    ? <a className="pt-link" href={`mailto:${c.email}`} title={String(c.email)} onClick={e => e.stopPropagation()}>{String(c.email)}</a>
                    : <span className="faint">—</span>}
                </td>
                {showTouch && <td className="pt-narrow faint">{lastTouch?.[c.id] ?? '—'}</td>}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function CheckIcon() { return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M5 12l4 4L19 6" /></svg> }
