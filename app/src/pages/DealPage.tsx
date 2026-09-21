import React, { useMemo, useRef, useState } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { useLiveRecords } from 'lemma-sdk/react'
import { lemmaClient } from '../lemma-client'
import { Logo, Score, Md, Radar5, Editable, StagePill, PeopleTable, OptionPopover, useFieldOptions } from '../components'
import { FieldGroups, GROUP_DEFS } from '../components/DealFields'
import { ChatPanel, Prefill } from '../components/ChatPanel'
import { StageMoveModal } from './Pipeline'
import { PersonDrawer } from './People'
import { OPEN_STAGES, STAGES, stageMeta, relTime, fmtDate, optionLabel, Deal, fieldLabel, FIELD_LABEL } from '../lib'

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'report', label: 'Report card' },
  { id: 'people', label: 'People' },
] as const

const FLAG_LABEL: Record<string, string> = {
  stage: 'Stage', geographies: 'Geography', sectors: 'Sector', check_size: 'Check size',
  geography: 'Geography', sector: 'Sector', funding_stage: 'Funding stage', sector_mismatch: 'Sector',
}

/**
 * The evaluator stores flags as data. Read out as a sentence, not as
 * `deal_breaker = true` — a false flag is not worth saying, and a true one is
 * a note for the partner, not a verdict.
 */
function flagSentence(key: string, value: unknown): string | null {
  if (value === false || value == null || value === '') return null
  const where = FLAG_LABEL[key] ?? key.replace(/_/g, ' ')
  if (value === true) return `Worth a look: this sits outside the thesis on ${where.toLowerCase()}`
  // The evaluator writes its notes as data — strip the machine spelling before
  // a partner reads it. "Flag, not a veto" is the evaluator talking to itself.
  const prose = String(value)
    .replace(/\bdeal[_-]?breaker\s*[=:]\s*(true|false)/gi, '')
    .replace(/\bflag,\s*not a veto\.?/gi, '')
    .replace(/\(?\bflag\b,?\s*(?:not a veto)?\)?/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([.,;])/g, '$1')
    .trim()
  const cut = prose.length > 220 ? `${prose.slice(0, 219).trimEnd()}…` : prose
  return `${where}: ${cut}`
}


/** A note is clamped until it is asked for — two lines, then the rest. */
function FlagLine({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  return (
    <button className={`dp-flag${open ? ' open' : ''}`} onClick={() => setOpen(o => !o)}>
      {text}{!open && text.length > 150 ? <span className="more"> read on</span> : null}
    </button>
  )
}

/** Long prose in a panel starts folded. */
function Collapsible({ lines, children }: { lines: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={`clamp${open ? ' open' : ''}`} style={{ '--lines': String(lines) } as React.CSSProperties}>
      {children}
      <button className="clamp-toggle" onClick={() => setOpen(o => !o)}>{open ? 'show less' : 'show more'}</button>
    </div>
  )
}

export default function DealPage() {
  const { id = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const nav = useNavigate()
  const podId = lemmaClient.podId
  const opts = useFieldOptions()
  const dealsQ = useLiveRecords<Deal>({ client: lemmaClient, podId, tableName: 'deals', filters: [{ field: 'id', op: 'eq', value: id }], limit: 1, reconcile: 'refetch' })
  const d = dealsQ.records?.[0]
  const reports = useLiveRecords<Record<string, any>>({ client: lemmaClient, podId, tableName: 'reports', filters: [{ field: 'deal_id', op: 'eq', value: id }], sort: [{ field: 'version', direction: 'desc' }], limit: 1, reconcile: 'refetch' })
  const activities = useLiveRecords<Record<string, any>>({ client: lemmaClient, podId, tableName: 'activities', filters: [{ field: 'deal_id', op: 'eq', value: id }], sort: [{ field: 'occurred_at', direction: 'desc' }], limit: 50, reconcile: 'refetch' })
  const contacts = useLiveRecords<Record<string, any>>({ client: lemmaClient, podId, tableName: 'contacts', filters: [{ field: 'deal_id', op: 'eq', value: id }], limit: 20, reconcile: 'refetch' })
  const sources = useLiveRecords<Record<string, any>>({ client: lemmaClient, podId, tableName: 'field_sources', filters: [{ field: 'deal_id', op: 'eq', value: id }], sort: [{ field: 'created_at', direction: 'desc' }], limit: 60, reconcile: 'refetch' })
  const proposals = useLiveRecords<Record<string, any>>({ client: lemmaClient, podId, tableName: 'proposals', filters: [{ field: 'deal_id', op: 'eq', value: id }, { field: 'status', op: 'eq', value: 'pending' }], limit: 30, reconcile: 'refetch' })

  const [prefill, setPrefill] = useState<Prefill>(null)
  const [openGroup, setOpenGroup] = useState<string>('')
  const [groupTouched, setGroupTouched] = useState(false)
  const [moveTo, setMoveTo] = useState<string | null>(null)
  const [stageOpen, setStageOpen] = useState(false)
  const stageBtn = useRef<HTMLSpanElement>(null)
  const [openPerson, setOpenPerson] = useState<string | null>(null)
  const [histOpen, setHistOpen] = useState(false)

  const rawTab = params.get('tab') ?? 'overview'
  const tab = TABS.some(t => t.id === rawTab) ? rawTab : 'overview'
  const setTab = (t: string) => {
    const p = new URLSearchParams(params)
    if (t === 'overview') p.delete('tab'); else p.set('tab', t)
    setParams(p, { replace: true })
  }

  React.useEffect(() => {
    const say = params.get('say')
    if (say) {
      setPrefill({ text: say })
      const p = new URLSearchParams(params)
      p.delete('say'); p.delete('agent'); setParams(p, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const firstFilled = GROUP_DEFS.find(g => g.attrs.some(a => (d as any)?.[a.field]))?.id ?? ''
  React.useEffect(() => {
    if (d && !groupTouched) setOpenGroup(firstFilled)
  }, [d?.id, firstFilled, groupTouched])

  const report = reports.records?.[0]
  const provRows = useMemo(() => {
    const seen: Record<string, Record<string, any>> = {}
    for (const r of sources.records ?? []) {
      const f = String(r.field_name)
      if (!seen[f] || String(r.created_at) > String(seen[f].created_at)) seen[f] = r
    }
    return seen
  }, [sources.records])
  const flags = useMemo(() => (d?.thesis_flags && typeof d.thesis_flags === 'object' ? Object.entries(d.thesis_flags) : []), [d?.thesis_flags])
  const dealById = useMemo(() => (d ? { [d.id]: d } as Record<string, Deal> : {}), [d])

  if (!d && dealsQ.isLoading) return <div className="inner"><div className="loading-full"><span className="spinner" /></div></div>
  if (!d) return <div className="inner"><div className="loading-full">Deal not found.</div></div>

  const openTrack = OPEN_STAGES as string[]
  const current = d.stage
  const ci = openTrack.indexOf(current)
  const closed = ci < 0
  const next = !closed ? openTrack[ci + 1] : undefined
  const proposedMove = (proposals.records ?? []).find(p => p.kind === 'stage_move' && openTrack.includes(String(p.proposed_value)))
  const moveTarget = proposedMove ? String(proposedMove.proposed_value) : next
  const canMove = !!proposedMove && openTrack.indexOf(String(proposedMove.proposed_value)) > ci
  const pending = d.approval_state === 'pending'
  // Only a real change counts as a change: a value for an attribute the deal
  // really has, a stage move, a duplicate. A question about the people — or an
  // agent's suggestion to go and look something up — is not one.
  const openChanges = (proposals.records ?? []).filter(p => {
    const k = String(p.kind)
    if (k === 'stage_move' || k === 'duplicate') return true
    return k === 'field' && !!p.field_name && String(p.field_name) in FIELD_LABEL
  }).length
  const openActions = (proposals.records ?? []).filter(p => ['research', 'analysis', 'reply'].includes(String(p.kind))).length

  const history = activities.records ?? []

  /** A stage move is one click. Passing still asks for a reason. */
  const moveStage = async (to: string) => {
    if (!d || to === d.stage) return
    await lemmaClient.records.update('deals', d.id, { stage: to } as any)
    await lemmaClient.records.create('activities', {
      deal_id: d.id, type: 'note', occurred_at: new Date().toISOString(),
      title: `Moved to ${stageMeta(to).label}`, summary: 'Stage changed on the deal page.', direction: 'internal',
    } as any).catch(() => {})
    dealsQ.refresh()
    proposals.refresh()
  }

  return (
    <div className="inner deal-view">
      <div className="dp-left">
      <div className="dp-head">
        <div className="dp-line1">
          <Logo name={d.company_name} url={d.logo_url} website={d.website} size="lg" />
          <Editable dealId={d.id} field="company_name" value={d.company_name} first="h1" onSaved={() => dealsQ.refresh()} />
          <span className="dp-tags">
            <StagePill id={current} label={stageMeta(current).label} />
            {d.score_overall != null && <span className="dp-score" title="Evaluator score"><Score value={d.score_overall} /></span>}
          </span>
        </div>

        <div className="dp-line2">
          <Editable dealId={d.id} field="one_liner" value={d.one_liner} placeholder="add a one-liner" multiline first="lead" onSaved={() => dealsQ.refresh()} />
          {d.website && <a className="dp-site" href={String(d.website).startsWith('http') ? String(d.website) : `https://${d.website}`} target="_blank" rel="noreferrer">{String(d.website).replace(/^https?:\/\//, '').replace(/\/$/, '')} ↗</a>}
        </div>

        <div className="dp-stageline">
          <span className="k">Stage</span>
          {closed
            ? <><span className="v">{stageMeta(current).label}</span>
                {d.pass_reason && <span className="faint">{d.pass_reason}</span>}
                <button className="dp-manual" onClick={() => setStageOpen(true)}>reopen</button></>
            : <>
                <span className="dp-stage-btn" ref={stageBtn}>
                  <button className={`stage-pill s-${current} dp-stage-pick`} onClick={() => setStageOpen(o => !o)} aria-haspopup="listbox">
                    <span className="sp-dot" />{stageMeta(current).label}
                    <span className="dp-caret">▾</span>
                  </button>
                  {stageOpen && (
                    <OptionPopover title="Move to" options={STAGES.map(st => ({ value: st.id, label: st.label }))}
                      value={current} anchorEl={stageBtn.current}
                      onPick={async (v) => {
                        setStageOpen(false)
                        if (!v || v === current) return
                        if (v === 'passed') { setMoveTo('passed'); return }
                        await moveStage(v)
                      }}
                      onClose={() => setStageOpen(false)} />
                  )}
                </span>
                {canMove && <span className="dp-proposed">an agent proposed {stageMeta(moveTarget as string).label}</span>}
                {(openChanges > 0 || openActions > 0) && (
                  <a className="dp-proposed" href="#/" onClick={e => { e.preventDefault(); nav('/') }}>
                    {openChanges > 0
                      ? `${openChanges} change${openChanges === 1 ? '' : 's'} waiting on you →`
                      : `${openActions} suggested action${openActions === 1 ? '' : 's'} waiting →`}
                  </a>
                )}
              </>}
        </div>

        <div className="tabs">
          {TABS.map(t => (
            <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
              {t.label}
              {t.id === 'people' && (contacts.records ?? []).length > 0 && <span className="ct">{(contacts.records ?? []).length}</span>}
            </button>
          ))}
        </div>
      </div>

        <main className="dp-body">
          {tab === 'overview' && (
            <>
              {flags.length > 0 && (
                <section className="dp-flags">
                  <span className="k">Against the thesis</span>
                  {flags.map(([k, v]) => flagSentence(k, v)).filter(Boolean).map((s, i) => (
                    <FlagLine key={i} text={s!} />
                  ))}
                </section>
              )}

              {d.brief && (
                <section className="dp-brief">
                  <h2>Brief</h2>
                  <Collapsible lines={4}><div className="prose"><Md>{String(d.brief)}</Md></div></Collapsible>
                </section>
              )}

              <FieldGroups deal={d} opts={opts} people={contacts.records ?? []} provRows={provRows}
                onSaved={() => dealsQ.refresh()} open={openGroup} setOpen={(g: string) => { setGroupTouched(true); setOpenGroup(g) }} />
            </>
          )}

          {tab === 'report' && (
            report ? (
              <section className="dp-report">
                <div className="section-head">
                  <h2>Report card</h2>
                  <span className="hint">
                    the evaluator's read, refreshed whenever the deal changes · scored {relTime(report.updated_at ?? report.created_at) || 'once'}
                  </span>
                </div>
                <Radar5 radar={report.radar as any} />
                <div className="dp-scores">
                  {[
                    ['Team', d.score_team], ['Market', d.score_market], ['Product', d.score_product],
                    ['Traction', d.score_traction], ['Thesis fit', d.score_thesis_fit],
                  ].map(([k, v]) => (
                    <div className="dp-score-cell" key={String(k)}>
                      <span className="k">{k}</span>
                      <span className="v">{v != null ? `${Number(v).toFixed(1)}` : '—'}<em>/5</em></span>
                    </div>
                  ))}
                </div>
                <div className="prose dp-report-body"><Md>{String(report.content ?? '')}</Md></div>
              </section>
            ) : (
              <div className="card" style={{ padding: 18 }}>
                <span className="chat-thinking"><span className="spinner" /> The evaluator is researching and scoring this deal — the report card lands here within a minute.</span>
              </div>
            )
          )}

          {tab === 'people' && (
            (contacts.records ?? []).length === 0
              ? <div className="empty"><strong>No founders linked yet</strong>They are added as intake and enrichment find them.</div>
              : <PeopleTable rows={contacts.records ?? []} dealById={dealById} onOpen={setOpenPerson} />
          )}
        </main>
      </div>

      <aside className="dp-rail">
          <ChatPanel dealId={id} dealName={d.company_name} prefill={prefill} onPrefillConsumed={() => setPrefill(null)} />
      </aside>

      {moveTo && (
        <StageMoveModal deal={d} toStage={moveTo} onClose={() => setMoveTo(null)} onDone={() => { dealsQ.refresh(); proposals.refresh() }} />
      )}
      {openPerson && (() => {
        const c = (contacts.records ?? []).find(x => x.id === openPerson)
        return c ? <PersonDrawer c={c} deal={d} onClose={() => setOpenPerson(null)} /> : null
      })()}
    </div>
  )
}
