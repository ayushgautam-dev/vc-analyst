// Shared constants + helpers
export const STAGES = [
  { id: 'new', label: 'New', color: '#6546d7' },
  { id: 'screening', label: 'Screening', color: '#94720b' },
  { id: 'first_meeting', label: 'First Meeting', color: '#3f4ec4' },
  { id: 'diligence', label: 'Diligence', color: '#5637c3' },
  { id: 'ic_review', label: 'IC Review', color: '#282722' },
  { id: 'invested', label: 'Invested', color: '#197b4a' },
  { id: 'passed', label: 'Passed', color: '#a04b42' },
  { id: 'parked', label: 'Parked', color: '#9b9890' },
] as const
export const OPEN_STAGES = ['new', 'screening', 'first_meeting', 'diligence', 'ic_review']
export const CLOSED_STAGES = ['invested', 'passed', 'parked']
export const PASS_REASONS = [
  { id: 'stage_mismatch', label: 'Stage mismatch' },
  { id: 'geo_mismatch', label: 'Geography mismatch' },
  { id: 'thesis_mismatch', label: 'Thesis / sector mismatch' },
  { id: 'weak_team', label: 'Team concerns' },
  { id: 'other', label: 'Other' },
]
export const stageMeta = (id: string) => STAGES.find(s => s.id === id) ?? STAGES[0]

export function relTime(iso?: string | null): string {
  if (!iso) return ''
  const t = new Date(iso).getTime()
  if (isNaN(t)) return ''
  const s = Math.max(0, (Date.now() - t) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  const d = Math.floor(s / 86400)
  if (d < 30) return `${d}d ago`
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function fmtDate(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined })
}

export function dueLabel(date?: string | null): { text: string; overdue: boolean } | null {
  if (!date) return null
  const d = new Date(date + (date.length === 10 ? 'T00:00:00' : ''))
  if (isNaN(d.getTime())) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000)
  if (diff < 0) return { text: `${-diff}d overdue`, overdue: true }
  if (diff === 0) return { text: 'due today', overdue: false }
  if (diff === 1) return { text: 'due tomorrow', overdue: false }
  return { text: `due ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`, overdue: false }
}

export const scoreClass = (v?: number | null) => v == null ? 'score-lo' : v >= 75 ? 'score-hi' : v >= 55 ? 'score-mid' : 'score-lo'

export function domainOf(url?: string | null): string | null {
  if (!url) return null
  const m = String(url).trim().toLowerCase().match(/^(?:https?:\/\/)?(?:www\.)?([a-z0-9-]+(?:\.[a-z0-9-]+)+)(?:[\/?#].*)?$/)
  const d = m?.[1] ?? null
  if (!d || d.includes('.example.')) return null
  return d
}

export function initials(name?: string | null): string {
  if (!name) return '?'
  return name.split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

export type Deal = Record<string, any> & { id: string; company_name: string; stage: string }

// ---------- proposals: the one review queue ----------
export type Proposal = Record<string, any>

export const FIELD_LABEL: Record<string, string> = {
  company_name: 'Company', one_liner: 'One-liner', website: 'Website', logo_url: 'Logo',
  stage: 'Stage', source: 'Source', brief: 'Brief', deck_file: 'Deck',
  next_step: 'Next step', next_step_due: 'Next step due', gmail_thread_id: 'Email thread',
  funding_stage: 'Funding stage', sector: 'Sector', geography: 'Geography', business_model: 'Business model',
  founded_year: 'Founded', team_size: 'Team size', hq_city: 'HQ',
  raising_amount: 'Raising', instrument: 'Instrument', valuation_pre_money: 'Pre-money valuation',
  total_raised: 'Raised to date', round_status: 'Round status', lead_investor: 'Lead investor',
  co_investors: 'Co-investors', proposed_check_size: 'Proposed check', target_ownership: 'Target ownership',
  decision: 'Decision', owner: 'Owner', ic_date: 'IC date',
  arr: 'ARR / revenue', growth: 'Growth', paying_customers: 'Paying customers',
  key_metric: 'Key metric', data_room_url: 'Data room', referred_by: 'Referred by',
}

export const PROPOSAL_LABEL: Record<string, string> = {
  field: 'Field', identity: 'Identity', duplicate: 'Duplicate', stage_move: 'Stage move',
  research: 'Research', analysis: 'Analysis', reply: 'Reply', note: 'Follow-up',
}

export const SOURCE_LABEL: Record<string, string> = {
  deck: 'deck', message: 'message', research: 'research', map: 'thesis map', human: 'you',
}

export const fieldLabel = (f?: string | null) => (f ? FIELD_LABEL[f] ?? String(f).replace(/_/g, ' ') : 'Field')

/** One-line provenance, e.g. "from deck" / "from you" — shown next to an editable value. */
export function provenanceLine(src?: string | null): string | null {
  if (!src) return null
  return `from ${SOURCE_LABEL[src] ?? src}`
}

/* ------------------------------------------------------------ closed lists */
/** Fallbacks for every closed list. The pod's `field_options` table wins when
 *  it has rows for a field — these exist so the UI never renders a broken picker. */
const l = (id: string, label: string) => ({ value: id, label })

export const FUNDING_STAGES = [l('pre_seed','Pre-seed'), l('seed','Seed'), l('series_a','Series A'), l('series_b','Series B'), l('series_c_plus','Series C+'), l('bootstrapped','Bootstrapped')]
export const INSTRUMENTS = [l('safe','SAFE'), l('equity','Equity'), l('convertible_note','Convertible note'), l('other','Other')]
export const ROUND_STATUSES = [l('not_raising','Not raising'), l('open','Open'), l('closing','Closing'), l('closed','Closed')]
export const DECISIONS = [l('undecided','Undecided'), l('proceed','Proceed'), l('pass','Pass')]

export const FALLBACK_OPTIONS: Record<string, { value: string; label: string }[]> = {
  stage: STAGES.map(s => l(s.id, s.label)),
  source: [l('email','Email'), l('whatsapp','WhatsApp'), l('manual','Manual')],
  pass_reason: PASS_REASONS.map(r => l(r.id, r.label)),
  funding_stage: FUNDING_STAGES,
  instrument: INSTRUMENTS,
  round_status: ROUND_STATUSES,
  decision: DECISIONS,
}

/** Turn a raw stored value into something a person reads. */
export function humanize(v?: string | null): string {
  if (!v) return ''
  return String(v).replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase())
}

export function optionLabel(field: string | null | undefined, value?: string | null): string {
  if (!value) return ''
  const hit = (field ? FALLBACK_OPTIONS[field] : undefined)?.find(o => o.value === value)
  return hit ? hit.label : humanize(value)
}

export const SELECT_FIELDS: Record<string, { value: string; label: string }[]> = FALLBACK_OPTIONS

/** The label for a proposal kind, in the one vocabulary the UI uses. */
export const CHANGE_LABEL: Record<string, string> = {
  field: 'Field', identity: 'Identity', duplicate: 'Looks like an existing deal',
  stage_move: 'Stage', research: 'Research', analysis: 'Numbers', reply: 'Reply', note: 'Follow-up',
}

/**
 * LinkedIn-scraped prose arrives HTML-escaped ("Metals,&amp; Infrastructure") and
 * with the sentence spacing stripped ("cat.Cats don't wait"). Decode the entities
 * and put the space back, conservatively: only between a lower-case letter or
 * digit and a following capital, so initialisms like "U.S.A" are left alone.
 */
export function cleanProfileText(v?: string | null): string {
  if (!v) return ''
  return String(v)
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/([a-z0-9,])\.([A-Z])/g, '$1. $2')
    .replace(/([a-z0-9])(•)/g, '$1\n$2')
    .trim()
}
