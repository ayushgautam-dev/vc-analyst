import React, { useCallback, useEffect, useState } from 'react'
import { lemmaClient } from '../lemma-client'

/**
 * The apps this CRM reads from — read live, never hardcoded.
 *
 * This page used to be a static array that printed the pod owner's own Gmail
 * address and phone number to every member, and said "Connected" whether or not
 * anything was. The rows now come from the organisation's Composio auth configs
 * and its connected accounts, and an app that is not connected offers the real
 * OAuth flow rather than a decorative button.
 */

const gicon = (d: string, sz = 128) => `https://www.google.com/s2/favicons?domain=${d}&sz=${sz}`

/** Name and logo for the apps we know; anything else falls back to its own id. */
const CATALOG: Record<string, { name: string; logo: string; blurb?: string }> = {
  // The favicon services answer gmail.com and calendar.google.com with Google's
  // generic "G", so those two point at Google's real product-icon assets.
  gmail: {
    name: 'Gmail',
    logo: 'https://ssl.gstatic.com/ui/v1/icons/mail/rfr/gmail.ico',
    blurb: 'Deals that arrive by email',
  },
  google_calendar: {
    name: 'Google Calendar',
    logo: 'https://www.gstatic.com/companion/icon_assets/calendar_2020q4_2x.png',
    blurb: 'Meetings against a deal',
  },
  granola: { name: 'Granola', logo: gicon('granola.ai', 256), blurb: 'Meeting notes' },
  metaads: { name: 'Meta Ads', logo: gicon('facebook.com') },
}

type Row = {
  key: string
  name: string
  logo?: string
  blurb?: string
  connectorId: string
  connected: boolean
  /** OAUTH2 apps can be connected from here. API_KEY ones cannot — the connect
   *  endpoint refuses them ("must be connected with the accounts API"), so
   *  offering a button that always errors would be worse than saying so. */
  oauth: boolean
}

function AppMark({ name, logo }: { name: string; logo?: string }) {
  const [failed, setFailed] = useState(false)
  return (
    <span className="app-mark" aria-hidden="true">
      {!logo || failed
        ? <span className="app-mark-fb">{name[0]?.toUpperCase()}</span>
        : <img src={logo} alt="" loading="eager" referrerPolicy="no-referrer" onError={() => setFailed(true)} />}
    </span>
  )
}

export default function Settings() {
  const [orgId, setOrgId] = useState<string | null>(null)
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const pod: any = await lemmaClient.pods.get(lemmaClient.podId as string)
      const org = String(pod?.organization_id ?? '')
      setOrgId(org || null)
      if (!org) { setRows([]); return }

      const [cfgRes, accRes]: any[] = await Promise.all([
        (lemmaClient.connectors as any).authConfigs.list(org, { limit: 100 }),
        (lemmaClient.connectors as any).accounts.list(org, { limit: 100 }),
      ])
      const cfgs: any[] = cfgRes?.items ?? []
      const accounts: any[] = accRes?.items ?? []

      setRows(cfgs.map(c => {
        const connectorId = String(c.connector_id ?? c.name ?? '')
        const meta = CATALOG[String(c.name ?? '')] ?? CATALOG[connectorId]
        // Match on the auth config id, not the connector id: several apps can
        // share a connector (every MCP server reports connector_id "mcp"), so
        // matching by connector would credit the wrong app with a connection.
        const acct = accounts.find(a => String(a.auth_config_id) === String(c.id))
        return {
          key: String(c.name ?? connectorId),
          name: meta?.name ?? String(c.name ?? connectorId),
          logo: meta?.logo,
          blurb: meta?.blurb,
          connectorId,
          connected: String(acct?.status ?? '').toUpperCase() === 'CONNECTED',
          oauth: String(c.auth_scheme ?? '').toUpperCase() === 'OAUTH2',
        }
      }))
    } catch (e: any) {
      setError(e?.message ? String(e.message) : 'Could not read the connected accounts.')
      setRows([])
    }
  }, [])

  useEffect(() => { void load() }, [load])

  /** Start the provider's OAuth flow and hand the person the consent screen. */
  const connect = async (row: Row) => {
    if (!orgId || busy) return
    setBusy(row.key); setError(null)
    try {
      const res: any = await (lemmaClient.connectors as any).createConnectRequest(orgId, row.connectorId)
      const url = res?.authorization_url
      if (url) window.open(String(url), '_blank', 'noopener')
      else setError(`${row.name} returned no authorization link — it may not use OAuth.`)
      // Consent happens in another tab; re-read so the row updates on return.
      void load()
    } catch (e: any) {
      setError(`Could not start ${row.name}: ${e?.message ?? e}`)
    } finally { setBusy(null) }
  }

  return (
    <div className="inner route-settings">
      <div className="viewhead">
        <div>
          <h1>Settings</h1>
          <div className="sub">The accounts this CRM reads deals from.</div>
        </div>
      </div>

      {error && <div className="set-error">{error}</div>}

      <div className="set-card">
        {rows === null && (
          <div className="connector-row set-loading"><span className="spinner" />Reading connected accounts…</div>
        )}
        {rows?.length === 0 && !error && (
          <div className="connector-row set-loading">No apps installed for this organisation yet.</div>
        )}
        {rows?.map(r => (
          <div className="connector-row" key={r.key}>
            <AppMark name={r.name} logo={r.logo} />
            <span className="conn-id">
              <span className="conn-name">{r.name}</span>
              {/* No account address here: the person knows their own, and the
                  org's address would otherwise be shown to every member. */}
              {r.blurb && <span className="conn-note">{r.blurb}</span>}
            </span>
            {r.connected
              ? <span className="conn-state"><span className="conn-dot" />Connected</span>
              : r.oauth
                ? <button className="btn sm" type="button" disabled={busy === r.key} onClick={() => void connect(r)}>
                    {busy === r.key ? 'Opening…' : 'Connect'}
                  </button>
                : <span className="conn-state off">Needs an API key</span>}
          </div>
        ))}
      </div>
    </div>
  )
}
