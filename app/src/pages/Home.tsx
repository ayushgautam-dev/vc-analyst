import React, { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveRecords } from 'lemma-sdk/react'
import { lemmaClient } from '../lemma-client'
import { WorkPane, QueueItem, waitingSince } from '../components/WorkItems'
import { StageMoveModal } from './Pipeline'
import { Logo, TypeLabel, SourceIcon } from '../components'
import { Deal, relTime, stageMeta, fieldLabel, FIELD_LABEL, optionLabel } from '../lib'

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'new', label: 'New deals' },
  { id: 'updates', label: 'Updates' },
] as const

function sourceKind(deal: Deal): { kind: string; label: string } {
  const src = String(deal.source ?? 'manual')
  if (src === 'whatsapp') return { kind: 'whatsapp', label: 'WhatsApp' }
  if (src === 'email') return { kind: 'email', label: 'Email' }
  if (deal.deck_file) return { kind: 'deck', label: 'Deck' }
  return { kind: 'intake', label: src }
}

/** The card says, in words, what arrived — the reference app's own grammar:
 *  a description of the deal for a new arrival, what changed for an update. */
function cardSummary(deal: Deal, fresh: boolean, n: number, proposals: Record<string, any>[]): string {
  const one = String(deal.one_liner ?? '').trim()
  if (fresh) {
    if (one) return one
    const facts = [String(deal.sector ?? '').trim(), String(deal.geography ?? '').trim()].filter(Boolean)
    return facts.length ? facts.join(' · ') : 'Nothing but a name so far — enrichment is still filling it in'
  }
  // What the card says is what the queue will ask you to decide: a value for a
  // real attribute, a stage move, or a duplicate. An agent's prose belongs in
  // its own reply, not on a card.
  const pending = proposals.filter(p => String(p.status ?? 'pending') === 'pending')
  const movers = pending.filter(p => p.kind === 'stage_move' || p.kind === 'duplicate'
    || (p.kind === 'field' && p.field_name && String(p.field_name) in FIELD_LABEL))
  const first = movers[0]
  const rest = movers.length > 1 ? ` · +${movers.length - 1} more` : ''
  if (first) {
    const kind = String(first.kind)
    if (kind === 'stage_move') return `Stage: ${stageMeta(deal.stage).label} → ${stageMeta(String(first.proposed_value)).label}${rest}`
    if (kind === 'duplicate') return `Looks like the same company as ${String(first.payload?.company_name ?? 'another card')}${rest}`
    const label = fieldLabel(String(first.field_name))
    const from = String(first.current_value ?? '').trim()
    const to = optionLabel(String(first.field_name), String(first.proposed_value ?? '')).trim()
    return `${label}: ${from ? optionLabel(String(first.field_name), from) : 'not set'} → ${to || 'blank'}${rest}`
  }
  const questions = pending.filter(p => String(p.kind) === 'identity')
  if (questions.length) return `A person to place${questions.length > 1 ? ` · +${questions.length - 1} more` : ''}`
  const want = pending.filter(p => ['research', 'analysis', 'reply'].includes(String(p.kind)))
  if (want.length) {
    const k = String(want[0].kind)
    const word = k === 'research' ? 'Research' : k === 'analysis' ? 'A numbers pass' : 'A reply'
    return `${word} suggested${want.length > 1 ? ` · +${want.length - 1} more` : ''}`
  }
  return one || 'Nothing changed'
}

export default function Home() {
  const podId = lemmaClient.podId
  const nav = useNavigate()
  const deals = useLiveRecords<Deal>({ client: lemmaClient, podId, tableName: 'deals', limit: 300, reconcile: 'refetch' })
  const proposals = useLiveRecords<Record<string, any>>({
    client: lemmaClient, podId, tableName: 'proposals',
    filters: [{ field: 'status', op: 'eq', value: 'pending' }], limit: 200, reconcile: 'refetch',
  })
  const contacts = useLiveRecords<Record<string, any>>({ client: lemmaClient, podId, tableName: 'contacts', limit: 1 })
  const thesis = useLiveRecords<Record<string, any>>({ client: lemmaClient, podId, tableName: 'thesis', limit: 1 })

  const [selKey, setSelKey] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<string>('all')
  const [move, setMove] = useState<{ p: Record<string, any>; deal: Deal } | null>(null)

  // Everything awaiting a human: arrivals that have not joined the pipeline yet,
  // and changes an agent proposes to deals already in it. One row per deal.
  const queue = useMemo<QueueItem[]>(() => {
    const raisedBy = new Map<string, Record<string, any>[]>()
    for (const p of proposals.records ?? []) {
      if (p.status !== 'pending') continue
      const k = String(p.deal_id)
      raisedBy.set(k, [...(raisedBy.get(k) ?? []), p])
    }
    const out: QueueItem[] = []
    for (const d of deals.records ?? []) {
      const raised = raisedBy.get(d.id) ?? []
      if (d.approval_state === 'pending') out.push({ key: `deal:${d.id}`, type: 'deal', deal: d, proposals: raised })
      else if (raised.length > 0) out.push({ key: `work:${d.id}`, type: 'work', deal: d, proposals: raised })
    }
    const oldest = (i: QueueItem) => String(i.type === 'deal' ? i.deal?.created_at ?? '' : (i.proposals ?? []).map(p => String(p.created_at ?? '')).sort()[0] ?? '')
    out.sort((a, b) => a.type === b.type
      ? (a.type === 'deal' ? oldest(b).localeCompare(oldest(a)) : oldest(a).localeCompare(oldest(b)))
      : (a.type === 'deal' ? -1 : 1))
    return out
  }, [deals.records, proposals.records])

  const visible = useMemo(() => {
    const ql = q.trim().toLowerCase()
    return queue.filter(i => {
      if (filter === 'new' && i.type !== 'deal') return false
      if (filter === 'updates' && i.type !== 'work') return false
      if (!ql) return true
      const d = i.deal
      return [d?.company_name, d?.one_liner, d?.website].some(v => String(v ?? '').toLowerCase().includes(ql))
    })
  }, [queue, q, filter])

  const decisions = queue.reduce((n, i) => n + (i.type === 'deal' ? 1 : 0) + (i.proposals?.length ?? 0), 0)
  const newDeals = queue.filter(i => i.type === 'deal').length
  const sel = visible.find(i => i.key === selKey) ?? visible[0]
  const noThesis = !thesis.isLoading && (thesis.records ?? []).length === 0

  return (
    <div className="inner inbox-view">
      {/* `show-work` only bites below 760px, where the two panes become one screen.
          Key it off an explicit selection, not the defaulted one, or the phone
          opens straight into a deal and the Inbox list is never seen. */}
      <div className={`inbox-shell${selKey && sel ? ' show-work' : ''}`}>
        <aside className="inbox-list">
          <div className="inbox-list-head">
            <h1>Inbox</h1>
            <div className="sub">
              {decisions === 0
                ? 'Nothing waiting on you'
                : `${queue.filter(i => i.type === 'deal').length} new · ${queue.filter(i => i.type === 'work').length} with changes`}
            </div>
            <input className="input" style={{ marginTop: 12 }} aria-label="Search Inbox" placeholder="Search deals…" value={q} onChange={e => setQ(e.target.value)} />
            <div className="inbox-filters">
              {FILTERS.map(f => (
                <button key={f.id} className={`filter-chip${filter === f.id ? ' on' : ''}`} onClick={() => setFilter(f.id)}>{f.label}</button>
              ))}
            </div>
            {noThesis && (
              <div className="inbox-hint">
                <a href="#/settings" onClick={e => { e.preventDefault(); nav('/settings') }}>Set your fund thesis →</a> unlocks scoring and deal-breaker checks.
              </div>
            )}
          </div>
          <div className="inbox-items">
            {visible.map(i => {
              const d = i.deal!
              const fresh = i.type === 'deal'
              const n = i.proposals?.length ?? 0
              const src = sourceKind(d)
              const on = sel?.key === i.key
              return (
                <button key={i.key} className={`inbox-item${on ? ' on' : ''}${fresh ? ' new' : ''}`} onClick={() => setSelKey(i.key)} aria-pressed={on}>
                  <span className="inbox-item-top">
                    <TypeLabel update={!fresh}>{fresh ? 'NEW DEAL' : 'UPDATE'}</TypeLabel>
                    <span className="inbox-item-time">{relTime(d.created_at) || waitingSince(d.created_at)}</span>
                  </span>
                  <span className="inbox-item-name">
                    <Logo name={d.company_name} url={d.logo_url} website={d.website} size="row" />
                    <span className="inbox-item-vent">{d.company_name || 'Unnamed company'}</span>
                  </span>
                  <span className="inbox-item-summary">{cardSummary(d, fresh, n, i.proposals ?? [])}</span>
                  <span className="inbox-item-meta"><SourceIcon kind={src.kind} word /></span>
                </button>
              )
            })}
            {visible.length === 0 && (
              <div className="empty">
                <strong>{queue.length === 0 ? 'Inbox zero' : 'No rows match'}</strong>
                {queue.length === 0
                  ? <>Forward a deck on WhatsApp or let the mailbox run — a new deal lands here with every attribute read off the deck, and nothing joins the pipeline until you approve it.</>
                  : 'Clear the search or switch the filter.'}
              </div>
            )}
          </div>
        </aside>

        <main className="inbox-work">
          {sel
            ? <WorkPane item={sel} onRefresh={() => { proposals.refresh(); deals.refresh() }} onReviewMove={(p, deal) => setMove({ p, deal })} />
            : <div className="empty" style={{ padding: '80px 34px' }}>
                <strong>Inbox zero</strong>
                Nothing is waiting on you. New arrivals and proposed updates appear here.
                <div style={{ marginTop: 14 }}>
                  <a className="btn" href="#/pipeline" onClick={e => { e.preventDefault(); nav('/pipeline') }}>Open Pipeline</a>
                </div>
              </div>}
        </main>
      </div>

      {move && (
        <StageMoveModal deal={move.deal} toStage={String(move.p.proposed_value ?? 'screening')}
          onClose={() => setMove(null)}
          onDone={async () => {
            await lemmaClient.records.update('proposals', move.p.id, {
              status: 'accepted', resolved_value: move.p.proposed_value ?? null, resolved_at: new Date().toISOString(),
            } as any)
            proposals.refresh(); deals.refresh()
          }} />
      )}
    </div>
  )
}
