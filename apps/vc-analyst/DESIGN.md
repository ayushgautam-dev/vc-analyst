# VC Analyst — design

The app's source is in [`/app`](../../app); `source/` beside this file is its built
output. This file is why it looks the way it does.

## One stylesheet

`app/src/styles.css` is the only stylesheet: one `:root` token block, one rule per
selector. An earlier version of this app accumulated stacked theme layers —
several competing `:root` blocks, the same button defined five times — and never
looked consistent because of it.

**Do not append a new layer to the bottom of the file.** Change the token, or the
rule where it already lives. If a change needs a new token, add it to `:root`.

## Tokens

- **Ground.** `--paper` is the canvas, `--sheet` is raised, `--sheet-2` is recessed.
- **One accent.** `--accent` (violet) is for interaction only — what you can press.
- **Semantic colour is not the accent.** `--pos` green means "the new value",
  `--amber` means "a person should look at this", `--neg` is destructive.
- **Type.** `--d` Fraunces for headings, `--s` Inter for body, `--m` JetBrains Mono
  for labels, metadata and every numeral.

## Screens

- **Inbox** — deals waiting on a person: new arrivals (`approval_state = pending`)
  and deals with a pending proposal against them.
- **Pipeline** — every approved deal, by stage.
- **Deal** — the brief, scores, per-field provenance ("from deck", "from you"),
  activity, and a co-pilot chat scoped to that deal.
- **People**, **Thesis**, **Settings**.

Every closed list (stage, instrument, pass reason…) is read from the pod's
`field_options` table, with fallbacks in `app/src/lib.ts` so a picker never renders
empty.

## First run

- **JoinGate** replaces the SDK's default access screen: one "join" action, then it
  re-checks membership itself so the app opens without a reload.
- **Onboarding** asks two things. The fund's website — enough for `thesis-builder`
  to work out stages, sectors, geographies and cheque size — is asked only while the
  team has no thesis, because the thesis is shared. Connecting Gmail / Calendar /
  Granola is personal, so it is asked of every partner once: skipped if their own
  Gmail is already connected, or once they have been through it in that browser.
