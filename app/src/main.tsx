import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthGuard, useCurrentUser, useLiveRecords, useRecords } from 'lemma-sdk/react'
import { lemmaClient } from './lemma-client'
import { Rail } from './components'
import JoinGate from './JoinGate'
import Onboarding from './Onboarding'
import { readSources } from './connectors'
import Home from './pages/Home'
import Pipeline from './pages/Pipeline'
import DealPage from './pages/DealPage'
import People from './pages/People'
import Person from './pages/Person'
import Thesis from './pages/Thesis'
import Settings from './pages/Settings'
import './styles.css'

const queryClient = new QueryClient()

function Shell({ email }: { email?: string }) {
  const podId = lemmaClient.podId
  const deals = useLiveRecords<Record<string, any>>({ client: lemmaClient, podId, tableName: 'deals', limit: 300, reconcile: 'refetch' })
  const proposals = useLiveRecords<Record<string, any>>({
    client: lemmaClient, podId, tableName: 'proposals',
    filters: [{ field: 'status', op: 'eq', value: 'pending' }], limit: 200, reconcile: 'refetch',
  })
  const contacts = useLiveRecords<Record<string, any>>({ client: lemmaClient, podId, tableName: 'contacts', limit: 500 })

  const counts = useMemo(() => {
    const rows = deals.records ?? []
    const raised = new Set((proposals.records ?? []).map(p => String(p.deal_id)))
    const inbox = rows.filter(d => d.approval_state === 'pending' || raised.has(d.id)).length
    const pipeline = rows.filter(d => d.approval_state !== 'pending').length
    return { Inbox: inbox, Pipeline: pipeline, People: (contacts.records ?? []).length }
  }, [deals.records, proposals.records, contacts.records])

  return (
    <div className="frame">
      {/* The rail's foot is the signed-in person and nothing else — no version
          string, no greetings. Settings sits right above it. */}
      <Rail counts={counts} foot={email ? email : ''} />
      <main className="main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/pipeline" element={<Pipeline />} />
          <Route path="/deal/:id" element={<DealPage />} />
          <Route path="/people" element={<People />} />
          <Route path="/person/:id" element={<Person />} />
          <Route path="/thesis" element={<Thesis />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}

function Root() {
  const { user, isLoading } = useCurrentUser({ client: lemmaClient })
  // This pod is shared by the team — the thesis table is one row for the whole
  // fund, not one per partner. So first run is split in two:
  //  - the fund step is a TEAM question: asked only while nobody has given the
  //    thesis a website, a fund name or a summary yet;
  //  - connecting accounts is a PERSONAL question: asked once per partner,
  //    remembered by their own Gmail being connected, or by a per-user flag in
  //    this browser once they have been through it (skipping counts).
  const thesis = useRecords<Record<string, any>>({
    client: lemmaClient, podId: lemmaClient.podId, tableName: 'thesis', limit: 1,
  })
  const userId = user ? String((user as any).id ?? '') : ''
  const flagKey = `vca:onboarded:${userId}`
  const [seen, setSeen] = useState<boolean | null>(null)
  const [gmail, setGmail] = useState<boolean | null>(null)
  const [justFinished, setJustFinished] = useState(false)

  useEffect(() => {
    if (!userId) return
    try { setSeen(localStorage.getItem(flagKey) === '1') } catch { setSeen(false) }
    let live = true
    readSources()
      .then(s => { if (live) setGmail(s.some(x => x.app === 'gmail' && x.connected)) })
      .catch(() => { if (live) setGmail(false) })
    return () => { live = false }
  }, [userId, flagKey])

  if (isLoading || thesis.isLoading || (user && (seen === null || gmail === null))) {
    return <div className="loading-full"><span className="spinner" /></div>
  }
  if (!user) return <div className="loading-full">Sign in to Lemma to open Venture OS.</div>

  const name = String((user as any).first_name ?? '').trim()
  const row = thesis.records?.[0]
  const teamHasThesis = !!(row && (row.website || row.fund_name || row.thesis))
  if (!justFinished && !seen && (!teamHasThesis || !gmail)) {
    return <Onboarding name={name || undefined} askFund={!teamHasThesis} onDone={() => {
      try { localStorage.setItem(flagKey, '1') } catch { /* private window — they'll just see it again */ }
      setJustFinished(true)
      void thesis.refresh()
    }} />
  }
  return <Shell email={(user as any).email ?? (user as any).name} />
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthGuard client={lemmaClient} accessRequestFallback={ctx => <JoinGate {...ctx} />}>
        <HashRouter>
          <Root />
        </HashRouter>
      </AuthGuard>
    </QueryClientProvider>
  </React.StrictMode>,
)
