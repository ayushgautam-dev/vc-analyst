import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCreateRecord } from 'lemma-sdk/react'
import { lemmaClient } from '../lemma-client'
import { Score, CheckIcon, useFieldOptions, SourceIcon, Logo, StagePill } from '../components'
import { AttributeGrid, allAttrs } from './DealFields'
import { stageMeta, fieldLabel, relTime, Deal, humanize, FIELD_LABEL, optionLabel, CHANGE_LABEL } from '../lib'

/**
 * One row in the Inbox: a deal a human has to decide on. A brand-new arrival is
 * a `deal` row — every attribute read off the arrival is on screen and editable
 * before it joins the pipeline. A deal already in the pipeline with unresolved
 * proposals is a `work` row. A company is never listed twice.
 */
export type QueueItem = {
  key: string
  type: 'deal' | 'work'
  deal?: Deal
  proposals?: Record<string, any>[]
}

export function waitingSince(iso?: string | null): string {
  if (!iso) return ''
  const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3600000)
  if (h < 1) return 'just arrived'
  if (h < 24) return `${h}h waiting`
  return `${Math.floor(h / 24)}d waiting`
}

const SOURCE_WORD: Record<string, string> = { email: 'email', whatsapp: 'WhatsApp', manual: 'added by hand' }

const FILE_FIELDS = ['deck_file']
function pretty(field: string | null, v: any) {
  if (v == null || v === '') return ''
  if (field && FILE_FIELDS.includes(field)) return String(v).split('/').pop() ?? String(v)
  return String(v)
}

/** Two lines of a draft, so a reply is readable without opening it. */
function preview(text?: string | null, lines = 2) {
  const t = String(text ?? '').trim()
  if (!t) return ''
  const parts = t.split(/\n+/).filter(Boolean).slice(0, lines)
  return parts.join(' ').slice(0, 220)
}

/**
 * The selected deal's work pane. Nothing here has been applied: an agent
 * proposes, you decide. One row per proposed change, each carrying its own two
 * buttons — never a bulk settle.
 */
export function WorkPane({ item, onRefresh, onReviewMove }: {
  item: QueueItem
  onRefresh: () => void
  onReviewMove?: (p: Record<string, any>, deal: Deal) => void
}) {
  const nav = useNavigate()
  const fsCreate = useCreateRecord({ client: lemmaClient, podId: lemmaClient.podId, tableName: 'field_sources' })
  const opts = useFieldOptions()
  const [busy, setBusy] = useState(false)
  const [arrivalAll, setArrivalAll] = useState(false)
  const [openRow, setOpenRow] = useState<string | null>(null)
  const deal = item.deal
  const raised = (item.proposals ?? []).filter(p => p.status === 'pending')
  // A note is not something to accept or reject — it is context, and it reads as
  // noise in a list of decisions. Only real changes and runnable actions show.
  const ACTIONS = ['research', 'analysis', 'reply']
  // A change the CRM can actually apply: a value for an attribute the deal
  // table really has, a stage move, or a duplicate fold. Anything else an agent
  // wants to say belongs in its reply, not in a queue of decisions.
  const changes = raised.filter(p => {
    const kind = String(p.kind)
    if (kind === 'duplicate' || kind === 'stage_move') return true
    if (kind !== 'field') return false
    const f = String(p.field_name ?? '')
    return !!f && f in FIELD_LABEL
  })
  const actions = raised.filter(p => ACTIONS.includes(String(p.kind)))
  // A person the intake worker could not place is a question about the deal's
  // people, not a value change: there is no field to write, so it can never be
  // "applied" and it must not read like an attribute that changed.
  const questions = raised.filter(p => String(p.kind) === 'identity')
  const fresh = item.type === 'deal'

  const close = async (p: Record<string, any>, status: 'accepted' | 'dismissed', resolved?: string | null) => {
    if (!p || busy) return
    setBusy(true)
    try {
      await lemmaClient.records.update('proposals', p.id, { status, resolved_value: resolved ?? null, resolved_at: new Date().toISOString() } as any)
      onRefresh()
    } finally { setBusy(false) }
  }

  /** Accept a field proposal: the proposed value becomes the deal's value, with provenance. */
  const useField = async (p: Record<string, any>) => {
    if (!p || !deal || busy) return
    const value = p.proposed_value ?? ''
    const field = p.field_name as string | null
    setBusy(true)
    try {
      if (field) {
        await lemmaClient.records.update('deals', deal.id, { [field]: value || null } as any)
        await fsCreate.create({
          deal_id: deal.id, field_name: field, value, source_class: p.source_class ?? 'message',
          evidence_url: p.evidence_url ?? null, evidence_note: `accepted from a proposal by ${p.source_class ?? 'an agent'}`,
        } as any)
      }
      await close(p, 'accepted', value)
    } finally { setBusy(false) }
  }

  const dismiss = (p: Record<string, any>) => close(p, 'dismissed', p?.current_value ?? null)

  /** A stage move from a row — one click, same as the deal page. */
  const useStage = async (p: Record<string, any>) => {
    if (!deal || busy) return
    const to = String(p.proposed_value ?? '')
    if (!to) return
    setBusy(true)
    try {
      await lemmaClient.records.update('deals', deal.id, { stage: to } as any)
      await close(p, 'accepted', to)
    } finally { setBusy(false) }
  }

  /** Accepting a duplicate folds this card into the deal it matches. */
  const mergeInto = async (p: Record<string, any>) => {
    if (!deal || busy) return
    const keep = String(p.payload?.keep_deal_id ?? p.evidence_url ?? '')
    setBusy(true)
    try {
      if (keep) await lemmaClient.functions.run('merge_deals', { input: { keep_id: keep, drop_id: deal.id } } as any)
      await close(p, 'accepted', keep || 'merged')
      onRefresh()
    } finally { setBusy(false) }
  }

  /** Approve a new arrival into the pipeline, or park it out of the way. */
  const approveDeal = async (park = false) => {
    if (!deal || busy) return
    setBusy(true)
    try {
      await lemmaClient.records.update('deals', deal.id, park
        ? { approval_state: 'approved', stage: 'parked', pass_reason: 'not a deal — parked at intake' } as any
        : { approval_state: 'approved' } as any)
      onRefresh()
    } finally { setBusy(false) }
  }

  /** Runnable proposals hand an editable brief to the assistant — nothing auto-runs. */
  const handToAssistant = (p: Record<string, any>) => {
    if (!deal || !p) return
    const kind = p.kind as string
    let text = ''
    if (kind === 'research') text = `Research: ${p.proposed_value ?? p.reason ?? ''}`
    else if (kind === 'analysis') text = String(p.proposed_value ?? p.reason ?? '')
    else if (kind === 'reply') text = 'Draft a reply to the most recent inbound email on this deal.'
    const agent = kind === 'research' ? 'researcher' : kind === 'analysis' ? 'analyst' : undefined
    nav(`/deal/${deal.id}?say=${encodeURIComponent(text)}${agent ? `&agent=${agent}` : ''}`)
  }

  if (!deal) return null
  const meta = stageMeta(deal.stage)
  const source = String(deal.source ?? 'manual')
  const fields = opts

  /** A suggested change is one line: the attribute, the value in force, the
   *  value an agent would write, and a tick and a cross. Expanding the line —
   *  anywhere on it — shows why, and where the value was read. */
  const lineFor = (p: Record<string, any>) => {
    const field = (p.field_name as string | null) ?? null
    const kind = String(p.kind ?? 'field')
    const label = field ? fieldLabel(field) : humanize(kind)
    const options = field ? fields[field] : undefined
    const shown = (v: any) => (options?.length ? optionLabel(field, String(v ?? '')) : (v == null || v === '' ? '' : String(v)))
    const proposed = pretty(field, p.proposed_value)
    const current = pretty(field, p.current_value)
    const reason = p.reason ? String(p.reason) : ''
    const open = openRow === p.id

    let oldText = current ? shown(current) : ''
    let newText = proposed ? shown(proposed) : ''
    if (kind === 'stage_move') {
      oldText = stageMeta(deal.stage).label
      newText = stageMeta(String(p.proposed_value ?? '')).label
    }
    if (kind === 'duplicate') {
      oldText = deal.company_name || 'this deal'
      newText = proposed || String(p.payload?.company_name ?? 'an existing deal')
    }

    const accept = () => {
      if (kind === 'stage_move') {
        if (String(p.proposed_value) === 'passed') onReviewMove?.(p, deal)
        else void useStage(p)
      } else if (kind === 'duplicate') void mergeInto(p)
      else void useField(p)
    }
    const acceptLabel = kind === 'stage_move' ? `Move to ${newText}` : kind === 'duplicate' ? 'Merge' : `Use “${newText}”`
    const keepLabel = kind === 'stage_move' ? `Keep ${oldText}` : kind === 'duplicate' ? 'Not the same' : `Keep ${oldText || 'empty'}`

    return (
      <article className={`prop${open ? ' open' : ''}`} key={p.id}>
        <header className="prop-head">
          <span className="prop-kind">{CHANGE_LABEL[kind] ?? 'Change'}</span>
          <span className="prop-title">{
            kind === 'stage_move' ? `Move to ${newText}`
            : kind === 'duplicate' ? `Same company as ${newText}`
            : label
          }</span>
          {typeof p.confidence === 'number' && (
            <span className="prop-conf">Confidence {Number(p.confidence).toFixed(1)}</span>
          )}
        </header>
        <div className="prop-diff">
          <span className="val-box old">
            <span className="vb-k">current</span>
            <span className="vb-v">{oldText || 'not set'}</span>
          </span>
          <span className="diff-arrow">{kind === 'duplicate' ? '=' : '→'}</span>
          <span className="val-box new">
            <span className="vb-k">proposed</span>
            <span className="vb-v">{newText || '—'}</span>
          </span>
        </div>
        {reason && <p className={`prop-why${open ? '' : ' clip'}`}>{reason}</p>}
        {reason && reason.length > 220 && (
          <button className="prop-more" onClick={() => setOpenRow(open ? null : String(p.id))} aria-expanded={open}>
            {open ? 'Show less' : 'Show more'}
          </button>
        )}
        <div className="prop-prov">
          {p.source_class ? <span>Read from {String(p.source_class)}</span> : null}
          {p.evidence_url && <a href={String(p.evidence_url)} target="_blank" rel="noreferrer">Open source ↗</a>}
        </div>
        <footer className="prop-foot">
          <button className="btn primary sm" disabled={busy} onClick={accept}><CheckIcon /> {acceptLabel}</button>
          <button className="btn sm" disabled={busy} onClick={() => dismiss(p)}>{keepLabel}</button>
        </footer>
      </article>
    )
  }

  /** A suggested action is the same card — but its control runs, it does not apply. */
  const actionLine = (p: Record<string, any>) => {
    const kind = String(p.kind ?? 'research')
    const word = kind === 'research' ? 'Research' : kind === 'analysis' ? 'Numbers' : 'Reply'
    const verb = kind === 'research' ? 'Run research' : kind === 'analysis' ? 'Run analysis' : 'Open draft'
    const title = String(p.proposed_value ?? p.reason ?? '')
    const why = String(p.reason ?? '')
    const open = openRow === p.id
    return (
      <article className={`prop action${open ? ' open' : ''}`} key={p.id}>
        <header className="prop-head">
          <span className="prop-kind">{word}</span>
          <span className="prop-title">{title}</span>
          {typeof p.confidence === 'number' && (
            <span className="prop-conf">Confidence {Number(p.confidence).toFixed(1)}</span>
          )}
        </header>
        {why && why !== title && <p className={`prop-why${open ? '' : ' clip'}`}>{why}</p>}
        {why && why !== title && why.length > 220 && (
          <button className="prop-more" onClick={() => setOpenRow(open ? null : String(p.id))} aria-expanded={open}>
            {open ? 'Show less' : 'Show more'}
          </button>
        )}
        <div className="prop-prov">
          {p.source_class ? <span>Read from {String(p.source_class)}</span> : null}
          {p.evidence_url && <a href={String(p.evidence_url)} target="_blank" rel="noreferrer">Open source ↗</a>}
        </div>
        <footer className="prop-foot">
          <button className="btn primary sm" disabled={busy} onClick={() => handToAssistant(p)}>{verb}</button>
          <button className="btn sm" disabled={busy} onClick={() => dismiss(p)}>Dismiss</button>
          <span className="prop-note">Nothing runs until you ask</span>
        </footer>
      </article>
    )
  }

  const arrivedOn = SOURCE_WORD[source] ?? source
  const sub = fresh
    ? `${arrivedOn} · ${relTime(deal.created_at) || waitingSince(deal.created_at)}`
    : `${meta.label} · last touch ${relTime(deal.last_activity_at ?? deal.updated_at) || 'no activity yet'}`

  return (
    <article className="work-pane">
      <button className="btn ghost sm mobile-back" onClick={() => nav('/')}>← Back to Inbox</button>

      <header className="wp-head">
        <Logo name={deal.company_name} url={deal.logo_url} website={deal.website} size="card" />
        <div className="wp-title">
          <h1>{deal.company_name || 'Unnamed company'}</h1>
          {!fresh && String(deal.one_liner ?? '').trim() && <p className="wp-desc">{String(deal.one_liner)}</p>}
          <div className="wp-sub">
            {fresh
              ? <SourceIcon kind={source === 'whatsapp' ? 'whatsapp' : source === 'email' ? 'email' : deal.deck_file ? 'deck' : 'manual'} word />
              : <StagePill id={deal.stage} label={meta.label} />}
            <span>{fresh
              ? (relTime(deal.created_at) || waitingSince(deal.created_at))
              : `Last touch ${relTime(deal.last_activity_at ?? deal.updated_at) || 'none yet'}`}</span>
          </div>
        </div>
        <div className="wp-aside">
          {deal.score_overall != null && (
            <div className={`wp-scoreblock ${deal.score_overall >= 75 ? 'hi' : deal.score_overall >= 55 ? 'mid' : 'lo'}`} title="Evaluator score">
              <b>{deal.score_overall}</b><em>/100</em>
              <span>Evaluator</span>
            </div>
          )}
          <div className="wp-actions">
            <a className="btn sm" href={`#/deal/${deal.id}`} onClick={e => { e.preventDefault(); nav(`/deal/${deal.id}`) }}>Open deal →</a>
            {fresh
              ? <>
                  <button className="btn sm" disabled={busy} onClick={() => approveDeal(true)}>Not a deal</button>
                  <button className="btn primary sm" disabled={busy} onClick={() => approveDeal(false)}><CheckIcon /> Create deal</button>
                </>
              : null}
          </div>
        </div>
      </header>

      <section className="wp-section">
        <div className="section-head">
          <h2>{fresh ? 'Extracted attributes' : 'The deal'}</h2>
          <span className="hint">{fresh ? 'Click any value to edit it before the deal is created' : 'Click any value to edit it'}</span>
        </div>
        <AttributeGrid deal={deal} opts={opts} onSaved={onRefresh}
          attrs={(arrivalAll ? allAttrs() : allAttrs().filter(a => (deal as any)[a.field]))
            .filter(a => a.field !== 'primary_contact_id')} />
        {(() => {
          const blank = allAttrs().filter(a => !(deal as any)[a.field] && a.field !== 'pass_reason').length
          if (blank === 0) return null
          return (
            <button className="arrival-more" onClick={() => setArrivalAll(v => !v)}>
              {arrivalAll ? 'Show fewer fields' : 'Show all fields'}
            </button>
          )
        })()}
      </section>

      {changes.length > 0 && (
        <section className="wp-section">
          <div className="section-head">
            <h2>Suggested changes</h2>
            <span className="hint">Nothing is applied until you accept it</span>
          </div>
          <div className="update-list">{changes.map(lineFor)}</div>
        </section>
      )}

      {actions.length > 0 && (
        <section className="wp-section">
          <div className="section-head">
            <h2>Suggested actions</h2>
            <span className="hint">An agent runs these when you ask</span>
          </div>
          <div className="update-list">{actions.map(actionLine)}</div>
        </section>
      )}

      {questions.length > 0 && (
        <section className="wp-section">
          <div className="section-head">
            <h2>People</h2>
            <span className="hint">Names on this deal the intake worker could not place — for you to check, nothing is written</span>
          </div>
          <div className="update-list">
            {questions.map(p => {
              const open = openRow === p.id
              const why = String(p.reason ?? '')
              return (
                <article className={`prop question${open ? ' open' : ''}`} key={p.id}>
                  <header className="prop-head">
                    <span className="prop-kind">People</span>
                    <span className="prop-title">A person to place</span>
                    {typeof p.confidence === 'number' && (
                      <span className="prop-conf">Confidence {Number(p.confidence).toFixed(1)}</span>
                    )}
                  </header>
                  <div className="prop-diff">
                    <span className="val-box old">
                      <span className="vb-k">on the deal</span>
                      <span className="vb-v">{pretty(null, p.current_value) || 'nobody'}</span>
                    </span>
                    <span className="diff-arrow">?</span>
                    <span className="val-box new">
                      <span className="vb-k">also named</span>
                      <span className="vb-v">{pretty(null, p.proposed_value) || '—'}</span>
                    </span>
                  </div>
                  {why && <p className={`prop-why${open ? '' : ' clip'}`}>{why}</p>}
                  {why.length > 220 && (
                    <button className="prop-more" onClick={() => setOpenRow(open ? null : String(p.id))} aria-expanded={open}>
                      {open ? 'Show less' : 'Show more'}
                    </button>
                  )}
                  <div className="prop-prov">
                    {p.source_class ? <span>Read from {String(p.source_class)}</span> : null}
                    {p.evidence_url && <a href={String(p.evidence_url)} target="_blank" rel="noreferrer">Open source ↗</a>}
                  </div>
                  <footer className="prop-foot">
                    <button className="btn sm" disabled={busy} onClick={() => dismiss(p)}>I have read this</button>
                    <span className="prop-note">Nothing is written either way</span>
                  </footer>
                </article>
              )
            })}
          </div>
        </section>
      )}

      {!fresh && changes.length === 0 && actions.length === 0 && questions.length === 0 && (
        <section className="wp-section">
          <div className="empty"><strong>Nothing waiting on this deal</strong>Open the deal page for the record, report card and history.</div>
        </section>
      )}
    </article>
  )
}
