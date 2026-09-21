import React, { useEffect, useState } from 'react'
import { useRecords, useUpdateRecord, useCreateRecord, useAgentTask } from 'lemma-sdk/react'
import { ShieldAlert, X, Check } from 'lucide-react'
import { lemmaClient } from '../lemma-client'
import { Logo, Spinner } from '../components'

type TagVal = { value: string; deal_breaker: boolean }

const WEIGHTS: [string, number][] = [['Team', 30], ['Market', 25], ['Thesis fit', 20], ['Traction', 15], ['Product', 10]]

/** One value on the profile: a chip row, or a plain value. Click to edit. */
function Line({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="tp-line">
      <div className="tp-k">{label}{hint && <span className="tp-hint">{hint}</span>}</div>
      <div className="tp-v">{children}</div>
    </div>
  )
}

/** Editable chips. A flagged chip means: a deal landing outside it gets a suggested pass. */
function Chips({ values, onChange, placeholder }: { values: TagVal[]; onChange: (v: TagVal[]) => void; placeholder: string }) {
  const [draft, setDraft] = useState('')
  const [open, setOpen] = useState(false)
  const add = () => {
    const v = draft.trim()
    if (v && !values.some(x => x.value.toLowerCase() === v.toLowerCase())) onChange([...values, { value: v, deal_breaker: false }])
    setDraft('')
  }
  return (
    <div className="tp-chips">
      {values.map((t, i) => (
        <span className={`tp-chip${t.deal_breaker ? ' flagged' : ''}`} key={i}>
          {t.value}
          <button className="tp-flag" title={t.deal_breaker ? 'Outside this is a deal-breaker — click to clear' : 'Flag: outside this is a deal-breaker'}
            onClick={() => onChange(values.map((x, j) => j === i ? { ...x, deal_breaker: !x.deal_breaker } : x))}><ShieldAlert size={11} /></button>
          <button className="tp-x" title="Remove" onClick={() => onChange(values.filter((_, j) => j !== i))}><X size={11} /></button>
        </span>
      ))}
      {open
        ? <input className="tp-chip-input" autoFocus value={draft} placeholder={placeholder}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } if (e.key === 'Escape') setOpen(false) }}
            onBlur={() => { add(); setOpen(false) }} />
        : <button className="tp-add" onClick={() => setOpen(true)}>+ Add</button>}
    </div>
  )
}

/** The website line: the URL, plus an edit chip that swaps in an input. */
function UrlLine({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  useEffect(() => { setDraft(value) }, [value])
  if (editing) {
    return (
      <div className="tp-inline tp-url-edit">
        <input autoFocus value={draft} placeholder="yourfund.com" onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { setEditing(false); onSave(draft) } if (e.key === 'Escape') setEditing(false) }} />
        <button className="btn sm accent" onClick={() => { setEditing(false); onSave(draft) }}><Check size={13} /> Save</button>
      </div>
    )
  }
  return (
    <span className="tp-url-line">
      {value
        ? <a href={value} target="_blank" rel="noreferrer">{value.replace(/^https?:\/\//, '')}</a>
        : <span className="faint">No website yet</span>}
      <button className="tp-edit" onClick={() => setEditing(true)}>{value ? 'Edit' : 'Add website'}</button>
    </span>
  )
}

/** A value that turns into an input on click — the profile page's only edit gesture. */
function Inline({ value, onSave, placeholder, multiline }: { value: string; onSave: (v: string) => void; placeholder: string; multiline?: boolean }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  useEffect(() => { setDraft(value) }, [value])
  if (editing) {
    return (
      <div className="tp-inline">
        {multiline
          ? <textarea autoFocus value={draft} rows={6} onChange={e => setDraft(e.target.value)} />
          : <input autoFocus value={draft} onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { setEditing(false); onSave(draft) } if (e.key === 'Escape') setEditing(false) }} />}
        <div className="tp-inline-actions">
          <button className="btn sm accent" onClick={() => { setEditing(false); onSave(draft) }}><Check size={13} /> Save</button>
          <button className="btn sm ghost" onClick={() => { setDraft(value); setEditing(false) }}>Cancel</button>
        </div>
      </div>
    )
  }
  return (
    <button className={`tp-still${value ? '' : ' blank'}`} onClick={() => setEditing(true)} title="Click to edit">
      {value || placeholder}
    </button>
  )
}

export default function Thesis() {
  const podId = lemmaClient.podId
  const q = useRecords<Record<string, any>>({ client: lemmaClient, podId, tableName: 'thesis', limit: 1 })
  const row = q.records?.[0]
  const upd = useUpdateRecord({ client: lemmaClient, podId, tableName: 'thesis', recordId: (row?.id as string) ?? null })
  const create = useCreateRecord({ client: lemmaClient, podId, tableName: 'thesis' })
  // The pod's generic default agent was being asked to do this. It has no idea
  // the thesis has structured fields or what shape they take, so it wrote a
  // paragraph into free_text and left stages/geographies/sectors/cheque size
  // empty — which is everything the evaluator actually scores against.
  // `thesis-builder` is the agent that knows the schema.
  const agent = useAgentTask({ client: lemmaClient, podId, agentName: 'thesis-builder' } as any)

  const [stages, setStages] = useState<TagVal[]>([])
  const [geos, setGeos] = useState<TagVal[]>([])
  const [sectors, setSectors] = useState<TagVal[]>([])
  const [ask, setAsk] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const fundName = String(row?.fund_name ?? '')
  const website = String(row?.website ?? '')
  const freeText = String(row?.free_text ?? '')
  const hasRow = !!row

  // Pull the row back when the builder actually finishes, and show the partner
  // what it said — including which fields it could not fill.
  const agentDone = (agent as any).isDone
  const agentError = (agent as any).error
  useEffect(() => {
    if (!agentDone) return
    q.refresh()
    setLoading(false)
    const said = String((agent as any).outputText ?? '').trim()
    setNote(said || 'Done — check the fields below.')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentDone])

  useEffect(() => {
    if (!agentError) return
    setLoading(false)
    setNote(`The thesis builder stopped: ${String((agentError as any)?.message ?? agentError)}`)
  }, [agentError])

  useEffect(() => {
    if (!row) return
    setStages((row.stages as TagVal[]) ?? [])
    setGeos((row.geographies as TagVal[]) ?? [])
    setSectors((row.sectors as TagVal[]) ?? [])
  }, [row?.id])

  const write = async (data: Record<string, any>) => {
    if (row) await upd.update({ ...data, onboarded: true } as any)
    else await (create as any).create({ ...data, onboarded: true })
    q.refresh()
  }

  /** Both onboarding paths end here: the agent reads the fund and structures the thesis. */
  async function build(from: string) {
    const text = from.trim()
    if (!text) return
    setNote(null); setLoading(true)
    try {
      const isUrl = /\.[a-z]{2,}$/i.test(text) && !text.includes(' ')
      const site = text.startsWith('http') ? text : `https://${text}`
      if (isUrl) await write({ website: site })
      else await write({ fund_name: text })
      // A sentence, not a bag of flags — the builder's own instruction says what
      // to fill and in what shape.
      await (agent as any).run(isUrl
        ? `Build this fund's thesis from its website: ${site}. Fill the structured fields — stages, geographies, sectors and cheque size — not only the summary.`
        : `Build the thesis for the fund called "${text}". Find its website first, then fill the structured fields — stages, geographies, sectors and cheque size — not only the summary.`)
      // Completion is handled by the effect below: the run streams for a minute
      // or two, and refreshing here read the row back before the agent had
      // written anything to it.
    } catch (e: any) {
      setNote(`Could not run the thesis builder: ${e?.message ?? e}`)
      setLoading(false)
    }
  }

  if (!hasRow && !loading) {
    return (
      <div className="inner">
        <div className="thesis-empty">
          <div className="tp-eyebrow">Thesis</div>
          <h1>What is your fund called?</h1>
          <p>Give us the name — we find the fund, read what it says about itself, and structure your thesis. The thesis drives scoring, deal-breaker checks and pass suggestions.</p>
          <div className="tp-ask">
            <input autoFocus value={ask} placeholder="Meridian Peak Capital — or meridianpeak.vc"
              onChange={e => setAsk(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void build(ask) }} />
            <button className="btn accent" disabled={!ask.trim()} onClick={() => void build(ask)}>Build my thesis</button>
          </div>
          {note && <div className="tp-note">{note}</div>}
        </div>
      </div>
    )
  }

  return (
    <div className="inner thesis-view">
      <header className="tp-head">
        <Logo name={fundName} website={website} size="lg" />
        <div className="tp-head-text">
          <h1>{fundName || 'Your fund'}</h1>
          <div className="tp-url">
            <UrlLine value={website} onSave={v => void write({ website: v || null })} />
          </div>
        </div>
        {/* Onboarding runs once, and if the builder only half-filled the thesis
            there was no way back to it — the partner was left re-typing every
            stage, geography and sector by hand. */}
        {(website || fundName) && (
          <button className="btn sm tp-rebuild" disabled={loading}
            title="Read the fund again and fill anything still empty"
            onClick={() => void build(website || fundName)}>
            {loading ? 'Reading…' : 'Re-read the fund'}
          </button>
        )}
      </header>

      {loading && (
        <div className="tp-note">
          <Spinner label={String((agent as any).activity || '').trim()
            || 'Reading the fund and structuring your thesis — this takes a minute or two…'} />
        </div>
      )}
      {note && !loading && <div className="tp-note">{note}</div>}

      <section className="tp-block">
        <h2>Where you invest</h2>
        <Line label="Stages">
          <Chips values={stages} onChange={v => { setStages(v); void write({ stages: v }) }} placeholder="Seed…" />
        </Line>
        <Line label="Geographies">
          <Chips values={geos} onChange={v => { setGeos(v); void write({ geographies: v }) }} placeholder="India…" />
        </Line>
        <Line label="Sectors" hint="include the ones you avoid">
          <Chips values={sectors} onChange={v => { setSectors(v); void write({ sectors: v }) }} placeholder="AI infra…" />
        </Line>
        <Line label="Check size">
          <div className="tp-pair">
            <Inline value={row?.check_size_min != null ? `$${Number(row.check_size_min).toLocaleString()}` : ''} placeholder="min"
              onSave={v => void write({ check_size_min: parseInt(v.replace(/[^0-9]/g, '')) || null })} />
            <span className="tp-dash">–</span>
            <Inline value={row?.check_size_max != null ? `$${Number(row.check_size_max).toLocaleString()}` : ''} placeholder="max"
              onSave={v => void write({ check_size_max: parseInt(v.replace(/[^0-9]/g, '')) || null })} />
          </div>
        </Line>
      </section>

      <section className="tp-block">
        <h2>In your words</h2>
        <Inline multiline value={freeText} placeholder="What you love, what you avoid, how you like to work with founders…"
          onSave={v => void write({ free_text: v || null })} />
      </section>

      <section className="tp-block">
        <h2>How deals are scored</h2>
        <div className="tp-weights">
          {WEIGHTS.map(([k, v]) => (
            <div className="tp-weight" key={k}>
              <span className="tp-wk">{k}</span>
              <span className="tp-bar"><i style={{ width: `${(v / 30) * 100}%` }} /></span>
              <span className="tp-wv">{v}%</span>
            </div>
          ))}
        </div>
        <p className="tp-formula">Overall score, 0–100, fixed weights in v1: 20 × (Team 30% + Market 25% + Thesis fit 20% + Traction 15% + Product 10%).</p>
      </section>
    </div>
  )
}
