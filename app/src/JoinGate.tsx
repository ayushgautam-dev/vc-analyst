import { useState } from 'react'
import type { AuthGuardAccessContext } from 'lemma-sdk/react'

/**
 * The screen a brand-new person lands on when they open the app link.
 *
 * The workspace is open to anyone with the link, so the SDK's default gate is
 * wrong twice over: it calls the workspace a "pod" and asks people to "request
 * access", and — because `usePodAccess.requestAccess()` only recognises a
 * PENDING reply — an instantly-approved join leaves the gate sitting there
 * until the visitor happens to reload. So we render our own: one short CTA,
 * and after the join we re-check membership ourselves so the app opens on the
 * spot.
 */

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export default function JoinGate(ctx: AuthGuardAccessContext) {
  const { app, status, user, error, requestAccess, refresh, switchAccount } = ctx
  const [joining, setJoining] = useState(false)
  const name = app.name?.trim() || 'VC Analyst'

  async function start() {
    setJoining(true)
    try {
      await requestAccess()
      // An open workspace approves on the spot, but membership can take a beat
      // to read back. Poll briefly, and only reload if it still hasn't landed.
      let next = await refresh()
      for (let attempt = 0; next === 'missing' && attempt < 3; attempt++) {
        await sleep(500)
        next = await refresh()
      }
      if (next === 'missing') window.location.reload()
    } catch {
      // Surfaced through ctx.error on the next render.
    } finally {
      setJoining(false)
    }
  }

  const copy =
    status === 'pending'
      ? "We're getting you set up. This page opens by itself the moment it's ready."
      : status === 'error'
        ? "We couldn't finish setting you up just now."
        : "You're signed in. One tap and you're in."

  const heading =
    status === 'pending' ? 'Almost there' : status === 'error' ? 'Try that again' : `Welcome to ${name}`

  const action = status === 'missing' ? start : () => void refresh()
  const label = joining
    ? 'Setting you up…'
    : status === 'pending'
      ? 'Check again'
      : status === 'error'
        ? 'Try again'
        : 'Start using'

  return (
    <div className="gate">
      <div className="gate-card">
        <div className="gate-eyebrow">{name}</div>
        <h1 className="gate-title">{heading}</h1>
        <p className="gate-copy">{copy}</p>
        {user?.email ? <div className="gate-who">{user.email}</div> : null}
        {status === 'error' && error ? <div className="gate-error">{error.message}</div> : null}
        <button className="btn primary gate-cta" type="button" onClick={() => void action()} disabled={joining}>
          {joining ? <span className="spinner" /> : null}
          {label}
        </button>
        <button className="btn ghost gate-alt" type="button" onClick={() => void switchAccount()}>
          Use another account
        </button>
      </div>
    </div>
  )
}
