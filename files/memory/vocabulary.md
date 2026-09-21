# Vocabulary — the canonical names

One concept, one name, in the schema, in the agents' instructions, and in the UI.
Do not introduce synonyms. If a name has to change, it changes everywhere in one go.

## Tables

| Name | What it holds |
|---|---|
| `deals` | One row per company the fund is looking at. The pipeline. |
| `people` | (reserved) A person the fund knows, independent of any deal. |
| `contacts` | A person attached to a specific deal. |
| `activities` | Something that happened on a deal: an email, a meeting, a note, a call. |
| `proposals` | Something an agent thinks should change, waiting on a human. |
| `field_sources` | Where one value on one deal came from. |
| `intake_log` | Every arrival, whether it became a deal or not. |
| `field_options` | The allowed values for any field with a closed list. |
| `team` | The fund's own people. Used to decide who owns an arrival. |
| `thesis` | The fund's investment thesis. Drives scoring. |
| `reports` | A scored report card for a deal, by version. |
| `email_threads` | Gmail thread → deal, so a reply stays in thread. |
| `intake_state` | Cursors and counters for automated intake. |

## Deal fields

- `company_name` — the company. Not "venture", not "account".
- `stage` — one of: new, screening, first_meeting, diligence, ic_review, invested, passed, parked.
- `approval_state` — `pending` (an unapproved arrival sitting in the inbox), `partial`, `approved` (it is a real deal in the pipeline).
- `source` — how the deal reached us: email, whatsapp, manual. This is the channel, and it is set once.
- `referred_by` — the person who passed it on, if it was not the founder writing cold.
- `owner` / `owner_id` — **the partner who owns the deal.** Never "pic", never "POC".
- `blockers` — the JSON list of reasons the deal cannot move forward.
- `pass_reason` — why it was passed, when it is passed.
- `next_step` / `next_step_due` — the one thing to do next, and when.

## Intake words

- `proposals` — the queue a partner works through. Never "review_items", never "cards".
- `proposal.kind` — field | stage_move | duplicate | identity | reply | research | analysis | note.
- `approval_state` — never "review_state".
- `proposed_stage` — a stage a worker thinks the deal has earned. It is proposed; a human moves it.
- `field_sources` — never "field_provenance".
- `intake_log` — never "intake_events".
- `field_options` — never "option_sets".
- `team` — never "roster".
- `match_verdict` — how an arrival was matched: new | matched | ambiguous | skipped | failed.
- `input_type` — what the arrival was: deck | founder_name | linkedin | company | forward | question | other.
- `source_class` — how a value was learned: deck | message | research | map | human.
- `owner` — see above. Never "pic".

## Plain words we share with everyone else

`deals`, `people`, `companies`, `activities`, `contacts`, `reports`, `thesis`.
Do not rename these; the platform and the UI already call them this.

## UI words

Owner · Proposal · Approve · Dismiss · Inbox · Pipeline · People · New deal · Update.
