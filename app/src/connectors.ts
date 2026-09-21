import { lemmaClient } from './lemma-client'

/* Connecting a partner's own Gmail / Calendar / Granola.
 *
 * All of this is organisation-scoped in the API, but the app only knows its pod
 * — so we read the pod once to learn which organisation it belongs to.
 *
 * The three auth configs already exist and are ACTIVE on the org, so nobody has
 * to install anything: a new partner needs a connect request and the consent
 * screen it points at. We never call `enableApp` from here — installing a
 * connector is an owner's job, not something a first-run screen should do on
 * somebody's behalf.
 */

export interface Source {
  app: string
  label: string
  why: string
  important?: boolean
  connected: boolean
  authConfigId?: string
  unavailable?: boolean
}

/** Keyed by auth-config name, which is what the org actually has installed.
 *  Granola's connector_id is the generic `mcp`, so the NAME is the only thing
 *  that identifies it — match on name throughout, never on connector_id. */
export const SOURCES: Omit<Source, 'connected'>[] = [
  { app: 'gmail', label: 'Gmail', why: 'Founder intros and decks become deals on their own.', important: true },
  { app: 'google_calendar', label: 'Google Calendar', why: 'Founder meetings land on the right deal.' },
  { app: 'granola', label: 'Granola', why: 'Your meeting notes arrive as deal activity.' },
]

let orgPromise: Promise<string> | null = null
/** The pod's organisation. Cached — it cannot change under a running page. */
export function organizationId(): Promise<string> {
  if (!orgPromise) {
    orgPromise = (async () => {
      const pod = await lemmaClient.pods.get(String(lemmaClient.podId))
      return String((pod as any).organization_id)
    })().catch(err => { orgPromise = null; throw err })
  }
  return orgPromise
}

const isLive = (status?: string | null) => {
  const s = String(status ?? '').toUpperCase()
  return s === 'CONNECTED' || s === 'ACTIVE'
}

/** What this partner has connected — never what the pod owner has connected. */
export async function readSources(): Promise<Source[]> {
  const org = await organizationId()
  const [me, configs, accounts] = await Promise.all([
    lemmaClient.users.current(),
    lemmaClient.connectors.authConfigs.list(org),
    lemmaClient.connectors.accounts.list(org, { limit: 200 }),
  ])
  const cfgs = ((configs as any).items ?? []) as { id: string; name: string; status?: string }[]
  const accts = ((accounts as any).items ?? []) as { auth_config_id: string; user_id: string; status?: string }[]
  const myId = String((me as any).id)

  return SOURCES.map(s => {
    const cfg = cfgs.find(c => c.name === s.app)
    return {
      ...s,
      authConfigId: cfg?.id,
      // No auth config means the owner has not installed that app on the org.
      // Show it, say so, and let them move on — do not offer a dead button.
      unavailable: !cfg,
      connected: !!cfg && accts.some(a =>
        a.auth_config_id === cfg.id && String(a.user_id) === myId && isLive(a.status)),
    }
  })
}

/** Start consent. Returns the provider URL to send them to, or null if the
 *  platform says they are already connected. */
export async function startConnect(authConfigId: string): Promise<string | null> {
  const org = await organizationId()
  const req = await lemmaClient.connectors.createConnectRequest(org, { auth_config_id: authConfigId })
  return (req as any).authorization_url ?? null
}
