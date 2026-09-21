import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useConversationMessages, useCreateRecord, useLiveRecords } from 'lemma-sdk/react'
import { conversationMessageText } from 'lemma-sdk'
import { Mail, CalendarPlus, SendHorizonal, Sparkles, FlaskConical, LineChart, X, MessageSquare } from 'lucide-react'
import { lemmaClient } from '../lemma-client'
import { Md, Spinner } from '../components'

type WidgetPayload = { type: string; to?: string; subject?: string; body?: string; slots?: string[]; purpose?: string }
export type Prefill = { text: string; agent?: 'researcher' | 'analyst' } | null
type TabId = 'ask' | 'reply' | 'schedule' | 'research' | 'analyze'

const REPLY_TEXT = 'Draft a reply to the most recent inbound email on this deal.'
const SCHEDULE_TEXT = 'Propose meeting times and draft the scheduling email for this deal.'
const RESEARCH_TEXT = 'Research: '

const AGENT_META = {
  researcher: { label: 'Researcher', icon: <FlaskConical size={12} />, hint: 'cited web research · usually 1–2 min' },
  analyst: { label: 'Analyst', icon: <LineChart size={12} />, hint: 'crunches the numbers in the deal file' },
} as const

const TABS: Array<{ id: TabId; label: string; icon: React.ReactNode }> = [
  { id: 'ask', label: 'Ask', icon: <MessageSquare size={13} /> },
  { id: 'reply', label: 'Reply', icon: <Mail size={13} /> },
  { id: 'schedule', label: 'Schedule', icon: <CalendarPlus size={13} /> },
  { id: 'research', label: 'Research', icon: <FlaskConical size={13} /> },
  { id: 'analyze', label: 'Numbers', icon: <LineChart size={13} /> },
]

const PLACEHOLDERS: Record<TabId, string> = {
  ask: 'Ask anything about this deal…',
  reply: 'Edit the reply brief, or send as-is…',
  schedule: 'Edit the scheduling brief, or send as-is…',
  research: 'Research: <topic, market, competitor…>',
  analyze: 'Ask about the numbers — metrics, model, cap table…',
}

/** Anything past a screenful is a document. */
const isLong = (t: string) => t.trim().length > 700 || /^#{1,3}\s/m.test(t)

function parseContent(text: string): Array<{ kind: 'md' | 'widget'; text?: string; widget?: WidgetPayload }> {
  const parts: Array<{ kind: 'md' | 'widget'; text?: string; widget?: WidgetPayload }> = []
  const re = /```widget\s*([\s\S]*?)```/g
  let last = 0, m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push({ kind: 'md', text: text.slice(last, m.index) })
    try { parts.push({ kind: 'widget', widget: JSON.parse(m[1]) }) } catch { parts.push({ kind: 'md', text: m[0] }) }
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push({ kind: 'md', text: text.slice(last) })
  return parts.filter(p => p.kind === 'widget' || (p.text && p.text.trim()))
}

function EmailDraftCard({ payload, onSend, sent, sending }: {
  payload: WidgetPayload
  onSend: (edited: { to: string; subject: string; body: string }) => void
  sent: boolean; sending: boolean
}) {
  const [to, setTo] = useState(payload.to ?? '')
  const [subject, setSubject] = useState(payload.subject ?? '')
  const [body, setBody] = useState(payload.body ?? '')
  return (
    <div className="draft-card">
      <div className="d-head">{payload.purpose === 'schedule' ? <CalendarPlus size={13} /> : <Mail size={13} />}
        {payload.purpose === 'schedule' ? 'Scheduling draft' : 'Email draft'}</div>
      <div className="d-field"><label>To</label><input value={to} onChange={e => setTo(e.target.value)} disabled={sent} /></div>
      <div className="d-field"><label>Subject</label><input value={subject} onChange={e => setSubject(e.target.value)} disabled={sent} /></div>
      <textarea value={body} onChange={e => setBody(e.target.value)} disabled={sent} />
      {payload.slots && payload.slots.length > 0 && (
        <div className="slot-chips">{payload.slots.map((s, i) => <span className="slot-chip" key={i}>{s}</span>)}</div>
      )}
      <div className="d-foot">
        {sent
          ? <span style={{ fontSize: 12, color: 'var(--good)', fontWeight: 600, alignSelf: 'center' }}>Sent via Gmail</span>
          : <button className="btn accent small" disabled={sending} onClick={() => onSend({ to, subject, body })}>
              {sending ? 'Sending…' : <><SendHorizonal size={13} /> Send via Gmail</>}
            </button>}
      </div>
    </div>
  )
}


/** A long answer is a document, not a bubble. It arrives collapsed — one line
 *  naming it — and opens in a reader, rendered as markdown rather than shown as
 *  raw source. */
function ResearchCard({ text, onOpen }: { text: string; onOpen: () => void }) {
  const first = text.split('\n').map(l => l.replace(/^#+\s*/, '').trim()).filter(Boolean)[0] ?? 'Research'
  const clean = first.replace(/[*_`]/g, '').slice(0, 90)
  const words = text.trim().split(/\s+/).length
  return (
    <div className="research-card">
      <FlaskConical size={13} style={{ color: 'var(--accent)', flex: 'none' }} />
      <span className="rc-k">{words > 260 ? 'research' : 'answer'}</span>
      <span className="rc-t">{clean}</span>
      <button className="btn sm" onClick={onOpen}>Read ↗</button>
    </div>
  )
}

function ReaderModal({ title, body, onClose }: { title: string; body: string; onClose: () => void }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [onClose])
  return (
    <div className="research-modal">
      <div className="rm-scrim" onClick={onClose} />
      <div className="rm-panel" role="dialog" aria-modal="true" aria-label={title}>
        <header>
          <h2>{title}</h2>
          <button className="icon-btn" style={{ marginLeft: 'auto' }} onClick={onClose} aria-label="Close">✕</button>
        </header>
        <div className="rm-body"><Md>{body}</Md></div>
      </div>
    </div>
  )
}

export function ChatPanel({ dealId, dealName, prefill, onPrefillConsumed }: {
  dealId: string
  dealName: string
  prefill?: Prefill
  onPrefillConsumed?: () => void
}) {
  const podId = lemmaClient.podId
  const chatRows = useLiveRecords<Record<string, any>>({ client: lemmaClient, podId, tableName: 'deal_chats', filters: [{ field: 'deal_id', op: 'eq', value: dealId }], limit: 5, reconcile: 'refetch' })
  const chatRow = chatRows.records?.[0]
  const conversationId = (chatRow?.conversation_id as string) ?? null
  const createChatRow = useCreateRecord({ client: lemmaClient, podId, tableName: 'deal_chats' })

  const msgs = useConversationMessages({
    client: lemmaClient, podId, agentName: 'deal-assistant',
    conversationId, enabled: !!conversationId, syncOnTurnEnd: true,
  })

  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState('')
  const [tab, setTab] = useState<TabId>('ask')
  const [sentCards, setSentCards] = useState<Record<string, 'sending' | 'sent'>>({})
  const [lastSent, setLastSent] = useState('')
  const [reader, setReader] = useState<{ title: string; body: string } | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const agentTag = tab === 'research' ? 'researcher' : tab === 'analyze' ? 'analyst' : null

  async function ensureChat(firstMessage: string) {
    if (creating) return
    setCreating(true)
    try {
      const conv = await msgs.createConversation({ title: `${dealName} — assistant` })
      await createChatRow.create({ deal_id: dealId, conversation_id: conv.id } as any)
      await msgs.sendMessage(`[deal_id: ${dealId}] ${firstMessage}`, { conversationId: conv.id } as any)
      chatRows.refresh()
    } finally { setCreating(false) }
  }

  function send(raw: string) {
    const tagged = agentTag && !raw.trim().startsWith('@') ? `@${agentTag} ${raw.trim()}` : raw.trim()
    if (!tagged) return
    setLastSent(tagged)
    setDraft('')
    if (!conversationId) { void ensureChat(tagged); return }
    // Every message carries the deal id, not just the first. The assistant used
    // to be told which deal it was on once, at the top of the conversation, and
    // had to hold it for the rest — one trim of the context and it was answering
    // about a company it could no longer identify. The display strips this
    // prefix, and SEND_EMAIL messages skip it (their JSON carries deal_id).
    void msgs.sendMessage(`[deal_id: ${dealId}] ${tagged}`)
  }

  // Bottom tabs stage an editable draft — they never send, and never clobber typed text.
  function pickTab(t: TabId) {
    const userTyped = draft.trim() && ![REPLY_TEXT, SCHEDULE_TEXT, RESEARCH_TEXT].includes(draft)
    setTab(t)
    if (!userTyped) {
      setDraft(t === 'reply' ? REPLY_TEXT : t === 'schedule' ? SCHEDULE_TEXT : t === 'research' ? RESEARCH_TEXT : '')
    }
    setTimeout(() => { inputRef.current?.focus(); inputRef.current?.setSelectionRange(9999, 9999) }, 40)
  }

  // Actions hand the composer an editable draft (+ tab) — never auto-send.
  useEffect(() => {
    if (prefill) {
      setDraft(prefill.text)
      setTab(prefill.agent === 'researcher' ? 'research' : prefill.agent === 'analyst' ? 'analyze'
        : prefill.text === SCHEDULE_TEXT ? 'schedule' : prefill.text === REPLY_TEXT ? 'reply' : 'ask')
      onPrefillConsumed?.()
      setTimeout(() => { inputRef.current?.focus(); inputRef.current?.setSelectionRange(9999, 9999) }, 60)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill])

  const messages = useMemo(() => {
    const list = [...(msgs.messages ?? [])]
    list.sort((a: any, b: any) => new Date(a.created_at ?? a.createdAt ?? 0).getTime() - new Date(b.created_at ?? b.createdAt ?? 0).getTime())
    return list.filter((m: any) => {
      const role = m.role ?? m.message_role
      const kind = (m.kind ?? 'TEXT').toString().toUpperCase()
      const text = conversationMessageText(m as any)?.trim() ?? ''
      if (kind !== 'TEXT') return false
      if (role === 'user' && text.startsWith('SEND_EMAIL:')) return false
      return (role === 'user' || role === 'assistant') && text
    })
  }, [msgs.messages])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages.length, msgs.streamingText])

  const busy = msgs.isRunning || msgs.isStreaming || creating
  const thinking = !busy ? null
    : creating ? 'Opening the deal file…'
    : lastSent.startsWith('@researcher') ? 'On it — cited web research takes a minute or two.'
    : lastSent.startsWith('@analyst') ? 'On it — crunching the numbers…'
    : 'Reading the deal file…'

  return (
    <div className="chat">
      <div className="chat-head">
        <Sparkles size={15} style={{ color: 'var(--accent)' }} />
        <div>
          <div className="ch-title">Deal assistant</div>
          <div className="ch-sub">It reads this deal, its report and its sources on every message</div>
        </div>
      </div>
      <div className="chat-scroll" ref={scrollRef}>
        {messages.length === 0 && !busy && (
          <div className="empty-note" style={{ padding: '18px 4px' }}>
            Ask about {dealName} — where a number came from, whether it fits the thesis, what the last email said. The tabs below are shortcuts for the usual asks.
          </div>
        )}
        {messages.map((m: any, i: number) => {
          const role = m.role ?? m.message_role
          const raw = conversationMessageText(m as any) ?? ''
          const text = raw.replace(/^\[deal_id:\s*[^\]]+\]\s*/, '')
          if (role === 'user') return <div className="msg user" key={m.id ?? i}><div className="bubble">{text}</div></div>
          const parts = parseContent(text)
          return (
            <div className="msg assistant" key={m.id ?? i} style={{ maxWidth: '100%' }}>
              {parts.map((p, j) => p.kind === 'md'
                ? (isLong(p.text!) && !/\.md\b/.test(p.text!)
                    ? <ResearchCard key={j} text={p.text!} onOpen={() => setReader({
                        title: p.text!.split('\n').map(l => l.replace(/^#+\s*/, '').trim()).filter(Boolean)[0]?.slice(0, 80) ?? 'Research',
                        body: p.text!,
                      })} />
                    : <div className="bubble" key={j}><Md>{p.text!}</Md></div>)
                : p.widget?.type === 'email_draft'
                  ? <EmailDraftCard key={j} payload={p.widget}
                      sent={sentCards[`${m.id}-${j}`] === 'sent'} sending={sentCards[`${m.id}-${j}`] === 'sending'}
                      onSend={edited => {
                        setSentCards(s => ({ ...s, [`${m.id}-${j}`]: 'sending' }))
                        void msgs.sendMessage(`SEND_EMAIL: ${JSON.stringify({ deal_id: dealId, ...edited })}`)
                        setTimeout(() => setSentCards(s => ({ ...s, [`${m.id}-${j}`]: 'sent' })), 1200)
                      }} />
                  : null)}
            </div>
          )
        })}
        {busy && <div className="chat-thinking"><Spinner /> {thinking}</div>}
      </div>
      {reader && <ReaderModal title={reader.title} body={reader.body} onClose={() => setReader(null)} />}
      <div className="chat-compose">
        <div className="chat-tabs">
          {TABS.map(t => (
            <button key={t.id} className={`ct-tab${tab === t.id ? ' active' : ''}`} onClick={() => pickTab(t.id)} title={t.id === 'ask' ? 'Ask the co-pilot anything' : undefined}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>
        {agentTag && (
          <div className="agent-pill-row">
            <span className="agent-pill">
              {AGENT_META[agentTag].icon} {AGENT_META[agentTag].label}
              <span className="ap-hint">{AGENT_META[agentTag].hint}</span>
              <button className="ap-x" aria-label="Remove agent" onClick={() => setTab('ask')}><X size={11} /></button>
            </span>
          </div>
        )}
        <div className="chat-input-row">
          <textarea
            ref={inputRef}
            placeholder={PLACEHOLDERS[tab]}
            value={draft}
            rows={2}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(draft) }
            }}
          />
          <button className="btn primary send-btn" disabled={busy || !draft.trim()} onClick={() => send(draft)} title="Send">
            <SendHorizonal size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}
