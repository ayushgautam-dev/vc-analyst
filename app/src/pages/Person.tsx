import React, { useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useRecord, useRecords } from 'lemma-sdk/react'
import { lemmaClient } from '../lemma-client'
import { Md, PersonMark, Score } from '../components'
import { relTime, stageMeta, Deal } from '../lib'

/** A founder's own page — the drawer's content, addressable. */
export default function Person() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const podId = lemmaClient.podId
  const contact = useRecord<Record<string, any>>({ client: lemmaClient, podId, tableName: 'contacts', recordId: id } as any)
  const c = (contact as any).record as Record<string, any> | undefined
  const dealQ = useRecord<Deal>({ client: lemmaClient, podId, tableName: 'deals', recordId: (c?.deal_id as string) ?? null } as any)
  const deal = (dealQ as any).record as Deal | undefined
  const activities = useRecords<Record<string, any>>({
    client: lemmaClient, podId, tableName: 'activities',
    filters: c?.deal_id ? [{ field: 'deal_id', op: 'eq', value: c.deal_id }] : [],
    sort: [{ field: 'occurred_at', direction: 'desc' }], limit: 100,
  })

  const mine = useMemo(() => {
    const list = activities.records ?? []
    if (!c?.name) return list
    const first = String(c.name).split(/\s+/)[0].toLowerCase()
    const involved = list.filter(a => Array.isArray(a.participants) && a.participants.some((p: any) => String(p).toLowerCase().includes(first)))
    return involved.length > 0 ? involved : list
  }, [activities.records, c?.name])

  if (!c) return <div className="inner"><div className="loading-full"><span className="spinner" /></div></div>
  const rp = (c.raw_profile ?? {}) as Record<string, any>

  return (
    <div className="inner route-people" style={{ maxWidth: 980 }}>
      <button className="btn ghost sm deal-back" onClick={() => nav(-1)}>← Back</button>
      <div className="deal-top">
        <div className="deal-title-row">
          <PersonMark name={c.name} photo={rp.profilePic} size="lg" />
          <div>
            <h1>{c.name}</h1>
            <div className="sub">{[c.role, c.company_name].filter(Boolean).join(' · ') || 'No role on record'}</div>
            <div className="deal-meta">
              {c.email && <a href={`mailto:${c.email}`}>{c.email}</a>}
              {c.phone && <span>{c.phone}</span>}
              {c.linkedin_url && <a href={String(c.linkedin_url)} target="_blank" rel="noreferrer">LinkedIn ↗</a>}
              <span>{String(c.enrichment_status ?? 'not enriched')}</span>
            </div>
          </div>
          {deal && (
            <a className="btn" href={`#/deal/${deal.id}`} onClick={e => { e.preventDefault(); nav(`/deal/${deal.id}`) }}>
              {deal.company_name} · {stageMeta(deal.stage).label} <Score value={deal.score_overall} />
            </a>
          )}
        </div>
      </div>

      <div className="deal-overview">
        <section className="glance">
          <h2>About</h2>
          {c.about
            ? <div className="card prose" style={{ padding: '16px 18px' }}><Md>{String(c.about)}</Md></div>
            : <div className="empty">No brief yet — enrichment {String(c.enrichment_status ?? 'pending')}.</div>}
        </section>

        <section className="glance">
          <h2>Activity with {String(c.name).split(/\s+/)[0]}</h2>
          {mine.length === 0
            ? <div className="empty">No activity yet.</div>
            : (
              <div className="timeline-feed">
                {mine.map(a => (
                  <div className="timeline-item" key={a.id}>
                    <span className="timeline-dot" />
                    <div className="timeline-copy">
                      <div className="timeline-title">{a.title}</div>
                      {a.summary && <div className="timeline-summary">{a.summary}</div>}
                      <div className="timeline-meta">{[a.type, relTime(a.occurred_at)].filter(Boolean).join(' · ')}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
        </section>
      </div>
    </div>
  )
}
