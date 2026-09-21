import { useCallback, useEffect, useRef, useState } from 'react'
import { useAgentTask } from 'lemma-sdk/react'
import { lemmaClient } from './lemma-client'
import { readSources, startConnect, type Source } from './connectors'

/* First run.
 *
 * This pod is shared by the team, so the two questions here belong to
 * different people. The fund's website — enough for the thesis builder to work
 * out what the fund invests in — is asked only while the team has no thesis
 * yet (`askFund`); whoever gets there first answers it for everyone. Their
 * inbox, which is where deal flow actually arrives, is personal and asked of
 * every partner.
 *
 * Nothing here is required. Every step moves forward whether or not it is
 * answered, because a partner who is only looking around should still reach
 * the product. The thesis run is deliberately NOT awaited: it takes a minute
 * or two, and there is no reason to make somebody watch it when they could be
 * connecting Gmail meanwhile. Unmounting only drops our stream — the run
 * itself finishes server-side and writes the row.
 */

type Step = 'welcome' | 'fund' | 'connect' | 'done'

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

/** A bare domain or a full URL — anything with a dot and no spaces. */
const looksLikeSite = (v: string) => /\.[a-z]{2,}$/i.test(v) && !v.includes(' ')

export default function Onboarding({ name, askFund = true, onDone }: { name?: string; askFund?: boolean; onDone: () => void }) {
  const podId = lemmaClient.podId
  const agent = useAgentTask({ client: lemmaClient, podId, agentName: 'thesis-builder' } as any)

  const [step, setStep] = useState<Step>('welcome')
  const [site, setSite] = useState('')
  const [sources, setSources] = useState<Source[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [busyWord, setBusyWord] = useState('Connecting…')
  const [note, setNote] = useState('')
  const [building, setBuilding] = useState(false)
  const marked = useRef(false)

  const load = useCallback(async () => {
    try { setSources(await readSources()) } catch { setSources([]) }
  }, [])
  useEffect(() => { void load() }, [load])

  /* The team's thesis row keeps the same `onboarded` flag the Thesis page
     writes. Only the partner who was asked the fund question touches it — the
     per-partner "been through first run" marker lives in main.tsx. */
  const markOnboarded = useCallback(async (patch: Record<string, unknown> = {}) => {
    try {
      const res = await lemmaClient.records.list('thesis', { limit: 1 })
      const row = ((res as any).items ?? [])[0]
      if (row) await lemmaClient.records.update('thesis', String(row.id), { ...patch, onboarded: true })
      else await lemmaClient.records.create('thesis', { ...patch, onboarded: true })
      marked.current = true
    } catch (e) {
      // Never trap somebody on first run over a failed write.
      setNote(`Could not save that — ${(e as Error)?.message ?? 'try again'}`)
    }
  }, [])

  async function submitFund(skip = false) {
    const text = site.trim()
    if (skip || !text) { await markOnboarded(); setStep('connect'); return }

    const isUrl = looksLikeSite(text)
    const url = text.startsWith('http') ? text : `https://${text}`
    await markOnboarded(isUrl ? { website: url } : { fund_name: text })

    // Fire and forget — they carry on to Gmail while this runs.
    setBuilding(true)
    void (agent as any).run(isUrl
      ? `Build this fund's thesis from its website: ${url}. Fill the structured fields — stages, geographies, sectors and cheque size — not only the summary.`
      : `Build the thesis for the fund called "${text}". Find its website first, then fill the structured fields — stages, geographies, sectors and cheque size — not only the summary.`)
    setStep('connect')
  }

  async function connect(s: Source) {
    if (!s.authConfigId) return
    setBusy(s.app); setBusyWord('Connecting…'); setNote('')
    try {
      const url = await startConnect(s.authConfigId)
      if (!url) { await load(); return }

      const win = window.open(url, '_blank', 'noopener,width=520,height=680')
      if (!win) { setNote('Your browser blocked the sign-in window — allow pop-ups and try again.'); return }
      setBusyWord('Waiting for sign-in…')

      // The consent screen is on the provider's origin and cannot talk back to
      // us, so watch the account list instead. Two minutes is long enough for
      // a Google consent screen including a password prompt.
      for (let i = 0; i < 60; i++) {
        await sleep(2000)
        try {
          const next = await readSources()
          setSources(next)
          if (next.some(x => x.app === s.app && x.connected)) return
        } catch { /* a hiccup mid-consent is not a failure */ }
      }
      setNote('Still waiting on that one. If you finished signing in, press Refresh.')
    } catch (e) {
      setNote(`Could not start that — ${(e as Error)?.message ?? 'try again'}`)
    } finally {
      setBusy(null)
      void load()
    }
  }

  async function finish() {
    if (askFund && !marked.current) await markOnboarded()
    onDone()
  }

  const connected = (sources ?? []).filter(s => s.connected)
  // Without the fund step there is one dot fewer; `at` is given as if it were there.
  const Dots = ({ at }: { at: number }) => (
    <div className="ob-dots" aria-hidden="true">
      {(askFund ? [0, 1, 2] : [0, 1]).map(i => <i key={i} className={i <= (askFund ? at : Math.max(0, at - 1)) ? 'on' : ''} />)}
    </div>
  )

  return (
    <div className="ob">
      <div className="ob-card">

        {step === 'welcome' && (
          <>
            <Dots at={0} />
            <div className="ob-eyebrow">VC Analyst</div>
            <h1>{name ? `Welcome, ${name}.` : 'Welcome.'}</h1>
            <p className="ob-line">
              This is your deal flow in one place — founder intros read and sorted for you,
              scored against what your fund actually invests in.
            </p>
            <p className="ob-line">
              {askFund
                ? 'Two quick things and it starts working. Neither takes a minute.'
                : "Your team's thesis is already set up — one quick thing and it starts working for you too."}
            </p>
            <div className="ob-row">
              <button className="btn primary lg" onClick={() => setStep(askFund ? 'fund' : 'connect')}>Get started</button>
            </div>
          </>
        )}

        {step === 'fund' && (
          <>
            <Dots at={1} />
            <h1>What's your fund's website?</h1>
            <p className="ob-line">
              We read what your fund says about itself and turn it into your thesis — stages,
              sectors, geographies, cheque size. That thesis is what every incoming deal
              gets scored against. You can correct all of it later.
            </p>
            <div className="ob-ask">
              <input
                autoFocus value={site} spellCheck={false}
                placeholder="yourfund.vc"
                onChange={e => setSite(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') void submitFund() }}
              />
            </div>
            <p className="ob-hint">A fund name works too, if you'd rather.</p>
            {note && <p className="ob-note">{note}</p>}
            <div className="ob-row">
              <button className="btn primary lg" disabled={!site.trim()} onClick={() => void submitFund()}>
                Build my thesis
              </button>
              <button className="btn ghost" onClick={() => void submitFund(true)}>Skip</button>
            </div>
          </>
        )}

        {step === 'connect' && (
          <>
            <Dots at={2} />
            <h1>Connect where your deals arrive.</h1>
            <p className="ob-line">
              Gmail is the one that matters — it's where founder intros and decks actually
              land, and it's what lets deals appear here without you typing them in. The
              others sharpen it. You can add any of them later.
            </p>

            <div className="ob-sources">
              {sources === null && <div className="ob-wait"><span className="spinner" /></div>}
              {(sources ?? []).map(s => (
                <div key={s.app} className={`ob-src${s.important ? ' key' : ''}`}>
                  <div className="ob-src-text">
                    <div className="ob-src-name">
                      {s.label}
                      {s.important && !s.connected && <span className="ob-tag">Recommended</span>}
                    </div>
                    <div className="ob-src-why">{s.why}</div>
                  </div>
                  {s.connected ? (
                    <span className="ob-on">Connected</span>
                  ) : s.unavailable ? (
                    <span className="ob-off">Not set up</span>
                  ) : (
                    <button className={`btn${s.important ? ' primary' : ''}`} disabled={busy === s.app}
                      onClick={() => void connect(s)}>
                      {busy === s.app ? busyWord : 'Connect'}
                    </button>
                  )}
                </div>
              ))}
            </div>

            {note && <p className="ob-note">{note}</p>}

            <div className="ob-row">
              <button className="btn primary lg" onClick={() => setStep('done')}>
                {connected.length === 0 ? 'Skip for now' : 'Continue'}
              </button>
              <button className="btn ghost" onClick={() => void load()}>Refresh</button>
            </div>
          </>
        )}

        {step === 'done' && (
          <>
            <Dots at={2} />
            <h1>You're set.</h1>
            {building ? (
              <p className="ob-line">
                Your thesis is being built in the background — it takes a minute or two.
                It'll be on the Thesis page when it's done, and you can correct anything there.
              </p>
            ) : askFund ? (
              <p className="ob-line">
                Add your fund's website on the Thesis page whenever you like — deals get
                scored against it once it's there.
              </p>
            ) : (
              <p className="ob-line">
                Every deal is scored against your team's thesis — it's on the Thesis page if
                you want to look it over.
              </p>
            )}
            {connected.length === 0 && (
              <p className="ob-line">
                Nothing is connected yet, so deals won't arrive on their own. You can connect
                Gmail from Settings whenever you want that.
              </p>
            )}
            <div className="ob-row">
              <button className="btn primary lg" onClick={() => void finish()}>Start using it</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
