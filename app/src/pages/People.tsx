import React, { useMemo, useState } from 'react'
import { useLiveRecords } from 'lemma-sdk/react'
import { lemmaClient } from '../lemma-client'
import { PersonMark, PeopleTable } from '../components'
import { Deal, relTime, cleanProfileText } from '../lib'

type Contact = Record<string, any>

function rpExtras(c: Contact) {
  const rp = (c.raw_profile ?? {}) as Record<string, any>
  const skills = (rp.skills ?? []).map((s: any) => (typeof s === 'object' ? s.title ?? s.name : s)).filter(Boolean)
  const conn = rp.connections ?? rp.connectionsCount
  const foll = rp.followers ?? rp.followersCount
  return { skills, connections: typeof conn === 'number' ? conn : null, followers: typeof foll === 'number' ? foll : null }
}

const STATUS: Record<string, string> = {
  done: 'Enriched', enriched: 'Enriched', pending: 'Enrichment pending',
  failed: 'Enrichment failed', not_found: 'Not found', none: 'Not enriched',
}

/** A scraped "About" runs to thousands of characters; show a screenful, then the rest. */
function AboutBlock({ text }: { text: string }) {
  const [open, setOpen] = React.useState(false)
  const long = text.length > 520
  return (
    <>
      <p className={`dw-about${long && !open ? ' clip' : ''}`}>{text}</p>
      {long && (
        <button className="dw-more" onClick={() => setOpen(o => !o)} aria-expanded={open}>
          {open ? 'Show less' : 'Read more'}
        </button>
      )}
    </>
  )
}

/** The person drawer: everything the pod knows about one founder, over the page. */
export function PersonDrawer({ c, deal, onClose }: { c: Contact; deal?: Deal; onClose: () => void }) {
  React.useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [onClose])
  const ex = rpExtras(c)
  const rp = (c.raw_profile ?? {}) as Record<string, any>
  const experience = Array.isArray(rp.experience) ? rp.experience : []
  const education = Array.isArray(rp.education) ? rp.education : []
  const company = rp.companyName ?? rp.company ?? rp.current_company ?? c.company_name ?? null
  const current = [c.role, company].filter(Boolean).join(' · ')
  const net = [
    ex.connections != null ? `${ex.connections.toLocaleString()} connections` : null,
    ex.followers != null ? `${ex.followers.toLocaleString()} followers` : null,
  ].filter(Boolean) as string[]

  const section = (title: string, inner?: React.ReactNode) => inner ? <div className="dw-sect"><h3>{title}</h3>{inner}</div> : null

  return (
    <div className="drawer open">
      <div className="drawer-scrim" onClick={onClose} />
      <aside className="drawer-panel" role="dialog" aria-label="Person details">
        <div className="dw-head">
          <PersonMark name={c.name} photo={c.photo_url ?? rp.profilePic ?? rp.profilePicture ?? rp.profile_pic ?? rp.avatar} size="lg" />
          <div className="dw-id">
            <div className="dw-name">{c.name ?? 'Unknown'}</div>
            {current && <div className="dw-headline">{current}</div>}
            {c.company_name && <div className="dw-company">{c.company_name}</div>}
            {rp.location && <div className="dw-loc">{String(rp.location)}</div>}
          </div>
          <button className="icon-btn dw-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="dw-meta"><span className="chip">{STATUS[String(c.enrichment_status ?? 'none')] ?? String(c.enrichment_status ?? 'Not enriched')}</span></div>
        <div className="dw-contacts">
          {c.linkedin_url && <a className="btn sm" href={String(c.linkedin_url)} target="_blank" rel="noreferrer">Open LinkedIn ↗</a>}
          {c.email && <a className="btn sm" href={`mailto:${c.email}`}>{c.email}</a>}
          {c.phone && <a className="btn sm" href={`tel:${c.phone}`}>{c.phone}</a>}
        </div>
        {net.length > 0 && <div className="dw-net">{net.join(' · ')}</div>}

        {deal && section('Associated deal', (
          <div className="dw-chips">
            <a className="chip deal-chip" href={`#/deal/${deal.id}`} onClick={onClose}>{deal.company_name}{c.role ? ` · ${c.role}` : ''}</a>
          </div>
        ))}
        {section('About', c.about ? <AboutBlock text={cleanProfileText(c.about)} /> : undefined)}
        {section('Experience', experience.length > 0 ? (
          <div className="dw-exp">
            {experience.map((e: any, i: number) => (
              <div className="dw-exp-row" key={i}>
                <div className="dw-exp-title">{[e.title, e.company].filter(Boolean).join(' · ') || '—'}{e.is_current ? <span className="chip sm">current</span> : null}</div>
                {e.duration && <div className="dw-exp-dur">{String(e.duration)}</div>}
              </div>
            ))}
          </div>
        ) : undefined)}
        {section('Education', education.length > 0 ? (
          <ul className="dw-list">{education.map((e: any, i: number) => <li key={i}>{typeof e === 'object' ? String(e.title ?? e.school ?? JSON.stringify(e)) : String(e)}</li>)}</ul>
        ) : undefined)}
        {section('Skills', ex.skills.length > 0 ? (
          <div className="dw-chips">{ex.skills.slice(0, 30).map((s: string, i: number) => <span className="chip" key={i}>{s}</span>)}</div>
        ) : undefined)}

        {!c.about && experience.length === 0 && (
          <div className="empty dw-empty">No enrichment details yet. Run LinkedIn enrichment to populate this profile.</div>
        )}
      </aside>
    </div>
  )
}

export default function People() {
  const podId = lemmaClient.podId
  const contacts = useLiveRecords<Contact>({ client: lemmaClient, podId, tableName: 'contacts', limit: 500, sort: [{ field: 'name', direction: 'asc' }], reconcile: 'refetch' })
  const deals = useLiveRecords<Deal>({ client: lemmaClient, podId, tableName: 'deals', limit: 300 })
  const activities = useLiveRecords<Record<string, any>>({ client: lemmaClient, podId, tableName: 'activities', limit: 500 })
  const [q, setQ] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const dealById = useMemo(() => Object.fromEntries((deals.records ?? []).map(d => [d.id, d])), [deals.records])

  /** Last touch per deal — the person inherits their deal's most recent activity. */
  const lastTouch = useMemo(() => {
    const byDeal: Record<string, string> = {}
    for (const a of activities.records ?? []) {
      const k = String(a.deal_id ?? '')
      if (!k) continue
      const t = String(a.occurred_at ?? '')
      if (!byDeal[k] || t > byDeal[k]) byDeal[k] = t
    }
    const out: Record<string, string> = {}
    for (const c of contacts.records ?? []) {
      const t = c.deal_id ? byDeal[String(c.deal_id)] : undefined
      if (t) out[String(c.id)] = relTime(t) || '—'
    }
    return out
  }, [activities.records, contacts.records])

  const rows = useMemo(() => {
    const ql = q.trim().toLowerCase()
    return (contacts.records ?? []).filter(c => !ql || [c.name, c.email, c.company_name, c.role, dealById[c.deal_id]?.company_name]
      .some(v => String(v ?? '').toLowerCase().includes(ql)))
  }, [contacts.records, q, dealById])

  const open = (contacts.records ?? []).find(c => c.id === openId)

  return (
    <div className="inner route-people">
      <div className="viewhead">
        <div>
          <h1>People</h1>
          <div className="sub">Founders and the fund's network. Open a row for the full profile.</div>
        </div>
        <input className="input" style={{ width: 220 }} placeholder="Search people…" value={q} onChange={e => setQ(e.target.value)} />
      </div>
      <div className="people-count">{rows.length} {rows.length === 1 ? 'person' : 'people'}</div>
      {rows.length === 0
        ? <div className="empty"><strong>No people yet</strong>They appear as intake and enrichment find them.</div>
        : <PeopleTable rows={rows} dealById={dealById} lastTouch={lastTouch} onOpen={setOpenId} />}
      {open && <PersonDrawer c={open} deal={open.deal_id ? dealById[open.deal_id] : undefined} onClose={() => setOpenId(null)} />}
    </div>
  )
}
