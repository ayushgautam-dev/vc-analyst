# Pod map

## The shape

One front door, three workers.

- **LEM** (`pod_default`) — the front door. Everything a person says lands here: ask about a
  deal, forward a deck, draft a reply, schedule a meeting, start research. LEM answers what it
  can and dispatches a worker for what it cannot.
- **intake** — reads arrivals from mail and WhatsApp, extracts what is really there, calls
  `upsert_deal`. The only thing that creates a deal.
- **evaluator** — turns a deal's material into a scored report card, and re-scores when the
  deal materially changes.
- **associate** — reads each new deal activity and, conservatively, proposes a stage move, a
  research topic, an analysis, or a reply. Proposes only.

## Tables

deals · contacts · activities · proposals · field_sources · intake_log · field_options ·
team · thesis · reports · email_threads · intake_state · deal_chats

`tasks` and `suggestions` are retired: nothing writes them. A follow-up is a `reply` proposal;
an agent's idea is a `proposals` row. Do not use either.

## Functions

- `upsert_deal` — the single write path for intake. Identity resolution, fill-empty-only,
  closed-list validation, per-field provenance, proposals.
- `web_research` — grounded web research.
- `enrich_linkedin_profile` — LinkedIn profile → structured founder data.
- `send_email_reply` — sends inside the deal's existing thread, and logs the activity.

## Arrivals

- **WhatsApp** → the `whatsapp` surface → **LEM**, which dispatches the intake worker.
- **Mail** → the `gmail-intake` trigger → the **intake** worker directly. The trigger carries the
  plain-language junk filter, so the cheap judgement runs before the worker wakes.

Different doors, same room: both end at `upsert_deal`, which is the only write path. One surface
per platform per pod, so a second WhatsApp intake agent cannot exist here.

## Schedules

- `gmail-intake` — the mail trigger (an arrival, not a poll) → intake worker.
- `review-new-activity` — new activity → the associate.
- `evaluate-new-deal` — a new deal → the evaluator.
- `rescore-on-activity` — material new activity → the evaluator, to re-score the report card.

The retired `gmail-intake-poll` cron is deleted; nothing polls.

## Instructions

Every agent's rules live in `/memory`, not in its config: `agents/lem.md`, `agents/intake.md`,
`agents/evaluator.md`, `agents/associate.md`.
