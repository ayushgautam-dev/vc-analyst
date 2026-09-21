import React, { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveRecords, useUpdateRecord, useCreateRecord } from 'lemma-sdk/react'
import { lemmaClient } from '../lemma-client'
import { Logo, Sheet, Score, OptionPopover } from '../components'
import { STAGES, OPEN_STAGES, CLOSED_STAGES, stageMeta, relTime, PASS_REASONS, optionLabel, Deal } from '../lib'

/** Stage moves are always a human decision, so they land in a sheet, not on the card. */
export function StageMoveModal({ deal, toStage, onClose, onDone }: { deal: Deal; toStage: string; onClose: () => void; onDone: () => void }) {
  const upd = useUpdateRecord({ client: lemmaClient, podId: lemmaClient.podId, tableName: 'deals', recordId: deal.id })
  const [reason, setReason] = useState(PASS_REASONS[0].id)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [reasonOpen, setReasonOpen] = useState(false)
  const reasonBtn = useRef<HTMLSpanElement>(null)
  const meta = stageMeta(toStage)
  const isPass = toStage === 'passed'
  return (
    <Sheet title={`Move ${deal.company_name} → ${meta.label}`}
      sub={isPass ? 'Passing is a human decision — pick a reason so the fund learns.' : 'Stage moves are always confirmed by you.'}
      onClose={onClose}
      footer={<>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className={`btn ${isPass ? 'danger' : 'accent'}`} disabled={busy} onClick={async () => {
          setBusy(true)
          const data: Record<string, any> = { stage: toStage }
          if (isPass) data.pass_reason = note ? `${reason}: ${note}` : reason
          else if (deal.stage === 'passed') data.pass_reason = null
          await upd.update(data as any)
          onDone(); onClose()
        }}>{busy ? 'Moving…' : `Move to ${meta.label}`}</button>
      </>}>
      {isPass && (
        <div className="field-stack"><span className="fs-label">Reason</span>
          <span className="dp-stage-btn" ref={reasonBtn}>
            <button type="button" className="input input-pick" onClick={() => setReasonOpen(o => !o)} aria-haspopup="listbox">
              {PASS_REASONS.find(r => r.id === reason)?.label ?? 'Pick a reason'}<span className="dp-caret">▾</span>
            </button>
            {reasonOpen && (
              <OptionPopover title="Why pass" options={PASS_REASONS.map(r => ({ value: r.id, label: r.label }))}
                value={reason} anchorEl={reasonBtn.current} onPick={v => { setReason(v); setReasonOpen(false) }} onClose={() => setReasonOpen(false)} />
            )}
          </span>
        </div>
      )}
      <label className="field-stack"><span>Note (optional)</span>
        <input className="input" type="text" value={note} onChange={e => setNote(e.target.value)} placeholder="One line for the record…" />
        <small>Recorded on the deal as its pass reason when moving to Passed.</small>
      </label>
    </Sheet>
  )
}

function DealCard({ deal, owner }: { deal: Deal; owner?: string }) {
  const nav = useNavigate()
  const flagged = deal.thesis_flags && Object.keys(deal.thesis_flags).length > 0
  // The card carries deal attributes only: the amount on the table, then where
  // the deal sits. A next step is a task, and a task is not a fact about the
  // company, so it never appears here.
  const facts = [
    deal.raising_amount ? String(deal.raising_amount) : null,
    deal.funding_stage ? optionLabel('funding_stage', String(deal.funding_stage)) : null,
    deal.sector ? String(deal.sector) : null,
  ].filter(Boolean).slice(0, 2) as string[]
  return (
    <a className="dcard" href={`#/deal/${deal.id}`} onClick={e => { e.preventDefault(); nav(`/deal/${deal.id}`) }}>
      <div className="dtop">
        <Logo name={deal.company_name} url={deal.logo_url} website={deal.website} />
        <span className="dname">{deal.company_name || 'Unresolved'}</span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          {flagged && <span className="flag-dot" title="Thesis deal-breaker flagged" />}
          <Score value={deal.score_overall} />
        </span>
      </div>
      {facts.length > 0 && <div className="dcard-facts">{facts.map(f => <span key={f} title={f}>{f}</span>)}</div>}
      <div className="dfoot">
        <span className="owner">Owner {owner ?? 'unassigned'}</span>
        <span className="when">{relTime(deal.last_activity_at) || relTime(deal.created_at)}</span>
      </div>
    </a>
  )
}

export default function Pipeline() {
  const podId = lemmaClient.podId
  const deals = useLiveRecords<Deal>({ client: lemmaClient, podId, tableName: 'deals', limit: 300, reconcile: 'refetch' })
  const contacts = useLiveRecords<Record<string, any>>({ client: lemmaClient, podId, tableName: 'contacts', limit: 500 })
  const createDeal = useCreateRecord({ client: lemmaClient, podId, tableName: 'deals' })
  const nav = useNavigate()
  const [addOpen, setAddOpen] = useState(false)
  const [q, setQ] = useState('')
  const [flagOnly, setFlagOnly] = useState(false)
  const [newName, setNewName] = useState(''); const [newOne, setNewOne] = useState(''); const [newSite, setNewSite] = useState('')


  const visible = useMemo(() => {
    const ql = q.trim().toLowerCase()
    // Deals still waiting for approval live in the Inbox, not on the board.
    return (deals.records ?? []).filter(d => d.approval_state !== 'pending').filter(d => {
      if (flagOnly && !(d.thesis_flags && Object.keys(d.thesis_flags).length > 0)) return false
      if (!ql) return true
      return [d.company_name, d.one_liner].some(v => String(v ?? '').toLowerCase().includes(ql))
    })
  }, [deals.records, q, flagOnly])

  const byStage = useMemo(() => {
    const m: Record<string, Deal[]> = {}
    for (const s of STAGES) m[s.id] = []
    for (const d of visible) m[d.stage]?.push(d)
    for (const s of STAGES) m[s.id].sort((a, b) => (b.score_overall ?? -1) - (a.score_overall ?? -1))
    return m
  }, [visible])

  const active = visible.filter(d => (OPEN_STAGES as string[]).includes(d.stage))
  const scored = active.filter(d => typeof d.score_overall === 'number')
  const wk = new Date(); wk.setHours(0, 0, 0, 0); wk.setDate(wk.getDate() - ((wk.getDay() + 6) % 7))
  const counts = [
    { n: active.length, l: 'Active deals', to: null },
    { n: visible.filter(d => new Date(d.created_at).getTime() >= wk.getTime()).length, l: 'New this week', to: null },
    { n: scored.length ? Math.round(scored.reduce((s, d) => s + (d.score_overall ?? 0), 0) / scored.length) : '—', l: 'Avg score · active', to: null },
    { n: visible.filter(d => d.thesis_flags && Object.keys(d.thesis_flags).length > 0).length, l: 'Thesis flags', to: null },
  ]

  return (
    <div className="inner">
      <div className="pipeline-head">
        <div className="viewhead">
          <h1>Pipeline</h1>
          <div className="sub">{active.length} live deals{(q || flagOnly) ? ' (filtered)' : ''} · move a deal when its next gate is ready</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input className="input" style={{ width: 190 }} placeholder="Search deals…" value={q} onChange={e => setQ(e.target.value)} />
          <button className={`btn sm${flagOnly ? ' accent' : ''}`} title="Only deals with a thesis deal-breaker flag"
            onClick={() => setFlagOnly(f => !f)}>Flagged</button>
          <button className="btn accent" onClick={() => setAddOpen(true)}>+ New deal</button>
        </div>
      </div>

      <div className="counts">
        {counts.map(c => c.to
          ? <button className="count card" key={c.l} onClick={() => nav(c.to!)}><div className="n">{c.n}</div><div className="l">{c.l}</div></button>
          : <div className="count card" key={c.l}><div className="n">{c.n}</div><div className="l">{c.l}</div></div>)}
      </div>

      <div className="pulse">
        {STAGES.filter(s => (OPEN_STAGES as string[]).includes(s.id) || s.id === 'invested').map(s => (
          <span className="seg" key={s.id}><span className="dot" style={{ background: s.color }} />{s.label} <b>{(byStage[s.id] ?? []).length}</b></span>
        ))}
      </div>

      <div className="board">
        {[...OPEN_STAGES, ...CLOSED_STAGES].map(sid => {
          const meta = stageMeta(sid)
          const list = byStage[sid] ?? []
          return (
            <div key={sid}>
              <div className="bhead">
                <span className="dot" style={{ background: meta.color }} />{meta.label}<span className="n">{list.length}</span>
              </div>
              {list.map(d => <DealCard key={d.id} deal={d} owner={d.owner ? String(d.owner) : undefined} />)}
              {list.length === 0 && <div className="empty">No deals at this stage</div>}
            </div>
          )
        })}
      </div>

      {addOpen && (
        <Sheet title="Add a deal" sub="The evaluator scores and researches it within a minute." onClose={() => setAddOpen(false)}
          footer={<>
            <button className="btn ghost" onClick={() => setAddOpen(false)}>Cancel</button>
            <button className="btn accent" disabled={!newName.trim()} onClick={async () => {
              const row: any = await createDeal.create({ company_name: newName.trim(), one_liner: newOne.trim() || null, website: newSite.trim() || null, stage: 'new', source: 'manual', approval_state: 'approved', last_activity_at: new Date().toISOString() } as any)
              setAddOpen(false); deals.refresh()
              if (row?.id) nav(`/deal/${row.id}`)
            }}>Add deal</button>
          </>}>
          <label className="field-stack"><span>Company</span>
            <input className="input" autoFocus value={newName} onChange={e => setNewName(e.target.value)} placeholder="Company name" /></label>
          <label className="field-stack"><span>One-liner</span>
            <input className="input" value={newOne} onChange={e => setNewOne(e.target.value)} placeholder="What they do, in a sentence" /></label>
          <label className="field-stack"><span>Website</span>
            <input className="input" value={newSite} onChange={e => setNewSite(e.target.value)} placeholder="https://…" /></label>
        </Sheet>
      )}
    </div>
  )
}
