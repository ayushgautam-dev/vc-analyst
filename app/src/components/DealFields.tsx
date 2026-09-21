import React from 'react'
import { Editable, FileLink } from '../components'
import type { Opt } from './opt'
import { lemmaClient } from '../lemma-client'
import { Deal } from '../lib'

export type Attr = {
  field: string
  label: string
  multiline?: boolean
  type?: string
  placeholder?: string
  select?: string      // a field_options key — renders a picker, never a text box
  contact?: boolean    // pick one of this deal's people
}

/**
 * The deal's fields, grouped the way a VC reads a deal — the round first, then
 * the company, traction, our own position, next step and sourcing. One list,
 * used by both the deal page and the inbox pane, so a field is added in one
 * place. Closed lists (funding stage, instrument, round status, decision …)
 * always render as a picker.
 */
export const GROUP_DEFS: { id: string; title: string; attrs: Attr[] }[] = [
  { id: 'round', title: 'The round', attrs: [
    { field: 'funding_stage', label: 'Funding stage', select: 'funding_stage' },
    { field: 'raising_amount', label: 'Raising', placeholder: 'e.g. USD 3M' },
    { field: 'instrument', label: 'Instrument', select: 'instrument' },
    { field: 'valuation_pre_money', label: 'Pre-money valuation', placeholder: 'e.g. USD 12M' },
    { field: 'total_raised', label: 'Raised to date', placeholder: 'e.g. USD 1.5M' },
    { field: 'round_status', label: 'Round status', select: 'round_status' },
    { field: 'lead_investor', label: 'Lead investor' },
    { field: 'co_investors', label: 'Co-investors' },
  ] },
  { id: 'company', title: 'The company', attrs: [
    { field: 'website', label: 'Website', placeholder: 'https://' },
    { field: 'sector', label: 'Sector', placeholder: 'e.g. fintech infrastructure' },
    { field: 'geography', label: 'Geography', placeholder: 'e.g. India, SEA' },
    { field: 'business_model', label: 'Business model', placeholder: 'e.g. B2B SaaS' },
    { field: 'hq_city', label: 'HQ' },
    { field: 'founded_year', label: 'Founded' },
    { field: 'team_size', label: 'Team size' },
  ] },
  { id: 'traction', title: 'Traction', attrs: [
    { field: 'arr', label: 'ARR / revenue', placeholder: 'e.g. USD 1.2M ARR' },
    { field: 'growth', label: 'Growth', placeholder: 'e.g. 18% MoM' },
    { field: 'paying_customers', label: 'Paying customers' },
    { field: 'key_metric', label: 'Key metric', placeholder: 'the one number they live on' },
    { field: 'data_room_url', label: 'Data room', placeholder: 'link' },
    { field: 'deck_file', label: 'Deck' },
  ] },
  { id: 'fund', title: 'Our position', attrs: [
    { field: 'owner', label: 'Owner', select: 'owner' },
    { field: 'proposed_check_size', label: 'Proposed check', placeholder: 'e.g. USD 500k' },
    { field: 'target_ownership', label: 'Target ownership', placeholder: 'e.g. 8' },
    { field: 'decision', label: 'Decision', select: 'decision' },
    { field: 'ic_date', label: 'IC date', type: 'date', placeholder: 'no date' },
  ] },
  { id: 'sourcing', title: 'Sourcing', attrs: [
    { field: 'source', label: 'Source', select: 'source' },
    { field: 'referred_by', label: 'Referred by' },
    { field: 'primary_contact_id', label: 'Owner contact', contact: true },
  ] },
]

/** Fields worth chasing. Used for the "Missing" line — nothing else. */
export const allAttrs = (): Attr[] => GROUP_DEFS.flatMap(g => g.attrs)

export function missingFields(deal: Deal): Attr[] {
  const skip = ['pass_reason', 'primary_contact_id', 'deck_file']
  return GROUP_DEFS.flatMap(g => g.attrs)
    .filter(a => !skip.includes(a.field) && !(deal as any)[a.field])
}

function AttrValue({ deal, a, opts, people, provRow, onSaved }: {
  deal: Deal; a: Attr; opts: Record<string, Opt[]>; people: Record<string, any>[]
  provRow?: Record<string, any>; onSaved: () => void
}) {
  const v = (deal as any)[a.field]
  if (a.field === 'deck_file') {
    return (
      <div className="attribute">
        <div className="attribute-label">{a.label}</div>
        <div className="attribute-value">
          {v ? <FileLink path={String(v)} /> : <span className="ed-value none">no deck</span>}
        </div>
      </div>
    )
  }
  const peopleList = people ?? []
  const person = a.contact ? peopleList.find(p => String(p.id) === String(v ?? '')) : undefined
  const options = a.contact
    ? peopleList.map(p => ({ value: String(p.id), label: String(p.name ?? 'Unknown') }))
    : a.select ? opts[a.select] ?? [] : undefined
  return (
    <div className="attribute">
      <div className="attribute-label">{a.label}</div>
      <div className="attribute-value">
        <Editable dealId={deal.id} field={a.field} value={v} options={options} multiline={a.multiline}
          inputType={a.type} placeholder={a.placeholder} source={provRow?.source_class} hint onSaved={onSaved}
          display={a.contact ? (person ? String(person.name) : (v ? 'someone not on this deal' : null)) : undefined} />
      </div>
    </div>
  )
}

/** One group of fields as flat label/value pairs — no accordion, for the inbox pane. */
export function AttributeGrid({ deal, attrs, opts, people, provRows, onSaved }: {
  deal: Deal; attrs?: Attr[]; opts: Record<string, Opt[]>; people?: Record<string, any>[]
  provRows?: Record<string, Record<string, any>>; onSaved: () => void
}) {
  const list = attrs ?? GROUP_DEFS.flatMap(g => g.attrs)
  return (
    <div className="attributes">
      {list.map(a => (
        <AttrValue key={a.field} deal={deal} a={a} opts={opts} people={people ?? []}
          provRow={provRows?.[a.field]} onSaved={onSaved} />
      ))}
    </div>
  )
}

/** The deal page's accordions: one group open at a time. */
export function FieldGroups({ deal, opts, people, provRows, onSaved, open, setOpen, extra }: {
  deal: Deal; opts: Record<string, Opt[]>; people: Record<string, any>[]
  provRows: Record<string, Record<string, any>>
  onSaved: () => void
  open: string
  setOpen: (id: string) => void
  extra?: React.ReactNode
}) {
  return (
    <div className="accordions">
      {GROUP_DEFS.map(g => {
        const isOpen = open === g.id
        const filled = g.attrs.filter(a => (deal as any)[a.field]).length
        return (
          <section className={`accordion${isOpen ? ' open' : ''}`} key={g.id}>
            <button className="accordion-head" onClick={() => setOpen(isOpen ? '' : g.id)} aria-expanded={isOpen}>
              <span className="chev">›</span>
              <span className="accordion-title">{g.title}</span>
              {!isOpen && filled === 0 && <span className="accordion-blank">nothing yet</span>}
              {!isOpen && filled > 0 && <span className="accordion-n">{filled} of {g.attrs.length}</span>}
            </button>
            <div className="accordion-body">
              <AttributeGrid deal={deal} attrs={g.attrs} opts={opts} people={people} provRows={provRows} onSaved={onSaved} />
              {isOpen && extra}
            </div>
          </section>
        )
      })}
    </div>
  )
}
