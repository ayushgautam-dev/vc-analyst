# Working in this repository

For anyone — person or agent — changing this pod for the first time.

This file is a map. How the pod behaves is in [README.md](README.md); why the app looks
the way it does is in [apps/vc-analyst/DESIGN.md](apps/vc-analyst/DESIGN.md); what each
agent does is in its own `instruction.md`, and the rules they all follow are in
[files/memory/](files/memory).

## Setting a fresh pod up

```bash
git clone --depth 1 https://github.com/ayushgautam-dev/vc-analyst && cd vc-analyst
export LEMMA_POD_ID=<pod>     # already set inside a pod's own workspace
./setup.sh                    # ~1.5 min: everything, then what to tell the person
```

`setup.sh` ends by printing what a person needs — the app's address and the pod's inboxes
— so hand that on as printed. Read it rather than reproducing it by hand: every step is
in the order it is for a reason written next to it.

**There is nothing to build.** `apps/vc-analyst/source/` is already built, so it is
uploaded as-is. Do not run `npm`/`pnpm install` to set a pod up; `app/` is only for
changing the app.

**Verified means read back from the pod** — `lemma pods describe`, `lemma schedules
list`, `lemma records list deals`. Not a browser: the app puts a Lemma sign-in in front of
every visitor, and that session belongs to a person.

## Seven things that are easy to get wrong

**The automations are created after the seed data, not paused during it.** The platform
matches a row event to automations a few seconds after the insert, so pausing
`evaluate-new-deal` and `review-new-activity` while loading rows still wakes an agent per
row once they are resumed. `setup.sh` imports everything except `schedules/`, seeds, then
imports `schedules/`. All four ship switched on (`is_active: true`), so a plain
`lemma pods import .` of this bundle turns them on too — load rows before, not after.

**`gmail-intake` is routed on create only.** Import it without
`--var gmail_intake_account=<id>` and it has no account and can never fire; import it
again without the variable and a working one loses its account. `./wire-gmail.sh` deletes
and re-creates it; `setup.sh` leaves an existing one alone.

**Grants are the whole security model.** An agent is created with access to nothing, and
import **replaces** its grants with the JSON — deleting a line revokes it. A grant is a
ceiling: a run gets the intersection of the agent's grants and the invoking person's own
access. Agents are granted `/memory` and `/decks`, so those folders must exist before the
agents do — they come from `files/`, imported with `--with-files`.

**The pod's own assistant is not in the bundle.** Its instruction and toolsets are fixed
by the platform, and an `agents/pod_default/` folder is rejected on import. Its rules live
in `files/memory/agents/lem.md`, which `files/memory/AGENTS.md` points it at.

**Every agent gets a mailbox when it is created** — the pod's own assistant too — named
`resend-<agent>-<suffix>`. A bundle surface with the plain name collides with it, so this
bundle declares none.

**Import upserts by name.** A resource's folder name is its primary key forever; renaming
one creates a second resource and orphans the first.

**Row-level security is off on purpose.** This is a team pod: one board, one thesis. Do
not turn it back on to "fix" something — the app's first run assumes the thesis row is
shared (only the first person is asked for the fund's website) while connections are
personal.

## Nothing pod-specific in the repo

This repository is public. No pod id, org id, account id or app URL is committed:

- `pod.json` variables have no defaults — each install supplies its own.
- `app/build.sh` builds with every `VITE_LEMMA_*` variable unset and refuses to finish if
  a uuid reaches `apps/vc-analyst/source/`. The host injects the pod's config at serve
  time.
- `.env.local` and `*.local.json` are gitignored. Keep your pod id and account ids there.
- `files/memory/` holds the rules only — never an agent's per-deal notes or a real fund's
  details. `fund.md` is a blank template on purpose.

Before committing, `git grep -nE '[0-9a-f]{8}-[0-9a-f]{4}-'` should find only the sample
data's fixed ids in `seed/sample/`.

## Changing things

| To change | Edit | Then |
|---|---|---|
| The app | `app/src/` | `./app/build.sh`, then deploy or re-import |
| An agent's behaviour | `agents/<name>/instruction.md`, or its rules in `files/memory/` | re-import (`--with-files` for memory) |
| A table | `tables/<name>/<name>.json` | re-import; a type change is drop + re-add |
| The sample | `seed/build_sample.py` | `python3 seed/build_sample.py` |

`lemma pods import . --dry-run` first when you have edited the bundle: it is the
cheapest place to find a bad grant or a malformed schedule.
