# VC Analyst

Deal flow in, decisions out — for a venture team, on one shared board.

A founder emails a deck. A minute later it is a card in the team's inbox: the company,
what it does, the founders with their LinkedIn history, every number from the deck with
the slide it came from, and a score against **your fund's thesis** — with the reasons it
does or does not fit. A partner approves it into the pipeline or passes. Nobody typed
anything.

The pod never decides for you. Agents read, research, score and **propose**; a person
moves a deal, changes a filled field, or sends an email. Every value on a deal carries
where it came from — the deck, the email, a web page, or a partner — so a number without
a source is visibly one.

---

## How it works

```
   founder intro / deck / forward
            │  email (Gmail), or forwarded to the pod's inbox
            ▼
   ┌─────────────────────┐   junk, vendors and newsletters dropped by
   │  intake             │   a cheap filter before the agent wakes;
   │  the only thing     │   the rest extracted with a source per field
   │  that creates deals │   and written through `upsert_deal`
   └─────────┬───────────┘
             ▼
   ┌─────────────────────┐   enriches what the web can answer, scores
   │  deal-evaluator     │   team · market · product · traction · thesis fit,
   │                     │   writes a versioned report card
   └─────────┬───────────┘
             ▼
   ┌─────────────────────┐
   │  a partner decides  │   Inbox → approve · pass · move stage
   └─────────┬───────────┘
             │  every new email, call note or meeting on a deal
             ▼
   ┌─────────────────────┐   proposes — conservatively — a stage move,
   │  deal-associate     │   a reply, research or an analysis. Proposes
   │                     │   only; most runs write nothing.
   └─────────────────────┘
```

**One shared board.** Row-level security is off on the working tables: every partner in
the pod sees the same deals, people, proposals and reports, and scores against one team
thesis. (Two tables stay per-person: `deal_chats`, which chat is whose, and
`intake_state`.)

**Agents propose, people decide.** On their own initiative no agent moves a stage, edits
a filled field, sends a message or deletes anything. They write a row in `proposals`, and
it waits in the inbox for a partner to accept or dismiss. The rules every agent reads
before acting are in [`files/memory/`](files/memory) — start with
[`guardrails.md`](files/memory/guardrails.md).

**Provenance or it did not happen.** Every value written to a deal gets a
`field_sources` row: `deck`, `message`, `research`, `map` or `human`, with the URL or
slide. The app shows it next to the value.

## Resources

| Kind | Name | What it is |
|---|---|---|
| table | `deals` | One row per company. `approval_state = pending` is the inbox; `approved` is the pipeline. |
| table | `contacts` | Founders and referrers, attached to a deal. |
| table | `activities` | Emails, meetings, calls and notes on a deal. |
| table | `proposals` | What an agent thinks should change, waiting on a person. |
| table | `reports` | A deal's scored report card, one row per version. |
| table | `field_sources` | Where each value on a deal came from. |
| table | `thesis` | The team's thesis — one row. The first person to open the app fills it from the fund's website. |
| table | `field_options` | The allowed values behind every picker (stage, instrument, pass reason…). |
| table | `team` | The fund's own people, so an arrival from a partner is not mistaken for a founder. |
| table | `intake_log`, `email_threads`, `intake_state`, `deal_chats` | Intake bookkeeping. `tasks` and `suggestions` are retired and kept only so a re-import does not drop them. |
| agent | `intake` | Turns an arrival into a card. Never scores, never replies. |
| agent | `deal-evaluator` | Enriches, scores against the thesis, writes the report card. |
| agent | `deal-associate` | Reads new activity and proposes the next step. |
| agent | `deal-assistant` | The chat on the deal page: answers from the deal file with sources, drafts replies. |
| agent | `thesis-builder` | Builds the thesis row from a fund's website at first run. |
| — | **LEM** | The pod's own assistant, which every pod already has. It runs with the permissions of whoever is talking to it, so it is not in this bundle; its rules are [`files/memory/agents/lem.md`](files/memory/agents/lem.md). |
| function | `upsert_deal` | The single write path for intake: identity resolution, fill-empty-only, closed-list validation, provenance, proposals. |
| function | `merge_deals`, `reconcile_deal` | Fold a duplicate card into the deal it matches; re-check after facts change. |
| function | `web_research` | Grounded web research. Keyless (DuckDuckGo) by default; faster with a personal Monid key. |
| function | `enrich_linkedin_profile` | LinkedIn URL → structured founder data. Needs a personal key — see below. |
| function | `send_email_reply` | Sends inside the deal's Gmail thread, through the sending partner's own Gmail. Only after a person pressed send. |
| schedule | `evaluate-new-deal` | New deal → `deal-evaluator`. |
| schedule | `rescore-on-activity` | New activity that could change the investment case → `deal-evaluator`. |
| schedule | `review-new-activity` | New activity → `deal-associate`. |
| schedule | `gmail-intake` | New Gmail message → `intake`. **Off until you wire it** — see below. |
| app | `vc-analyst` | Inbox · Pipeline · Deal · People · Thesis · Settings. Design notes in [`apps/vc-analyst/DESIGN.md`](apps/vc-analyst/DESIGN.md). |
| files | `/memory`, `/decks` | The agents' rulebook, and where intake saves every deck it receives. |

## Setting it up

Into a pod that already exists, with the [Lemma CLI](https://lemma.work) signed in:

```bash
git clone --depth 1 https://github.com/ayushgautam-dev/vc-analyst && cd vc-analyst
LEMMA_POD_ID=<pod> ./setup.sh
```

About a minute and a half. That is the tables, functions, agents with their grants, the
agents' rulebook, the app deployed, Gmail and Google Calendar installed on the
organization, ten sample deals, and the automations — and it ends by printing where the
app is and the addresses the pod answers on. Nothing is built: `apps/vc-analyst/source/`
ships as built output, which the CLI uploads as-is.

To have an agent do it instead, paste [SETUP-PROMPT.md](SETUP-PROMPT.md) into the pod's
chat.

### What happens the first time someone opens the app

1. **The fund's website.** Asked only while the team has no thesis. `thesis-builder`
   reads the site and fills stages, sectors, geographies and cheque size in the
   background; anyone can correct it on the Thesis page.
2. **Connect Gmail, Calendar, Granola.** Asked of every partner once — connections are
   personal. Skipped for anyone whose Gmail is already connected.

### Sample data

`setup.sh` loads ten **invented** deals — three waiting in the inbox, seven across the
pipeline — with founders, activity, open proposals and three report cards, so nobody
opens an empty app. Every one is on a `.example` domain and `referred_by: "Sample data"`,
and the agents' rulebook tells them to leave sample deals alone.

```bash
LEMMA_POD_ID=<pod> ./seed/clear.sh        # remove them — only them
LEMMA_POD_ID=<pod> ./setup.sh --no-sample # never load them
```

The option lists behind every picker are loaded too (`seed/config/`); those are real
configuration and stay. Whoever runs `setup.sh` is added to `team` and as a deal owner.

### Wire Gmail — so intros arrive on their own

```bash
LEMMA_POD_ID=<pod> ./wire-gmail.sh
```

Run it once somebody has connected Gmail (the app's onboarding or Settings does that).
It points `gmail-intake` at that inbox and turns it on. Every new email is offered to a
cheap filter first; only what could be a company raising money wakes `intake`.

> **Why a script and not a setting.** A webhook automation takes its routing key from the
> connected account only when it is **created**, so the script deletes `gmail-intake` and
> creates it again. And an import that omits the account strips it off — which is why
> `setup.sh`, re-run, leaves an existing `gmail-intake` alone.

### Personal keys — optional

`enrich_linkedin_profile` needs a key, and each person brings their own, kept in their
private files where nobody else can read it:

| File | For |
|---|---|
| `/me/keys/brightdata.txt` | LinkedIn profiles — cheap, basic fields |
| `/me/keys/monid.txt` | LinkedIn profiles with full history; faster `web_research` |

Without either, the pod works; founder cards just stay as thin as the email made them.

## What never travels in a bundle

- **Connected accounts.** Each partner connects their own Gmail and Calendar from the app.
- **Granola.** An MCP connector that needs a URL; add it on the organization as
  `granola` and onboarding picks it up.
- **Table rows**, apart from what `seed/` loads, and **your keys**.

## Verifying it

```bash
lemma pods describe                                   # everything landed
lemma schedules list                                  # three on, gmail-intake off until wired
lemma records list deals --limit 20                   # the sample, if loaded
lemma chat deal-assistant "What is in the pipeline?"  # an agent that can read the board
```

End to end, once Gmail is wired: email yourself a short intro from another address with
a deck attached → a card appears in the app's inbox within a minute or two, then a score.

## Changing it

The app's source is in [`app/`](app); `apps/vc-analyst/source/` is its built output and
is what the bundle deploys. So a change to the app is two steps — edit `app/`, then
`./app/build.sh` — see [app/AGENTS.md](app/AGENTS.md). Everything else is edited in place
and re-imported; [AGENTS.md](AGENTS.md) lists what is easy to get wrong.

## Layout

```
AGENTS.md                  how to work in this repo, and what breaks
SETUP-PROMPT.md            paste into a pod's chat to have its assistant set it up
setup.sh                   sets a fresh pod up end to end
wire-gmail.sh              routes gmail-intake at a connected inbox, and turns it on
pod.json                   metadata + the ${variables} an import resolves
tables/                    fifteen tables; JSON carries columns and row-level security
functions/                 code.py + JSON with each function's grants
agents/                    instruction.md + JSON with each agent's grants and toolsets
schedules/                 the four automations
files/memory/              the agents' rulebook — read before every run
apps/vc-analyst/           DESIGN.md + source/ — BUILT output, uploaded as-is
app/                       the React + Vite project source/ is built from
seed/                      option lists, the sample deal flow, and the scripts that load and clear it
```

## Built with

[Lemma](https://lemma.work) — tables, agents, functions, automations and apps in one pod.

## License

[MIT](LICENSE)
