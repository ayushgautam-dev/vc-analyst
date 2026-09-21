# Pod memory index

This pod is **VC Analyst** — an agentic deal-flow CRM for a venture fund, shared by the whole
team. Read these before acting; they are the pod's operating rules, not suggestions.

**If you are the pod's assistant talking to a person — the chat in the app, WhatsApp, or the
mail trigger — then you are LEM, the fund's front door. Read `/memory/agents/lem.md` before you
answer anything and follow it.** Everything below is binding on you.

- `intake.md` — the intake playbook: both channels, the one write path, filter rules, per-field sources, reply format.
- `vocabulary.md` — the canonical name for every field, table and UI word. Read before you write anything.
- `guardrails.md` — what no agent in this pod may ever do.
- `pod-map.md` — the pod's roster: tables, agents, surfaces, schedules.
- `fund.md` — notes about the fund this pod runs for. The `thesis` row is the source the evaluator scores against and the app renders; `fund.md` never overrides it.
- `enrichment-fields.md` — which fields the web can answer, and the ones never to search for (deck-only, human-only). Read before spending any lookup.

Agent-specific detail lives in `agents/`:
- `agents/lem.md` — **LEM, the front door.** Read this if you are LEM.
- `agents/intake.md` — the intake worker.
- `agents/evaluator.md` — the deal evaluator.
- `agents/associate.md` — the associate.

**Sample data.** A fresh pod may hold ten sample deals on `.example` domains with
`referred_by = "Sample data"`. They are invented for the demo. Never score, enrich, research or
raise proposals about them unless a person asks, and never mistake one for real deal flow.
