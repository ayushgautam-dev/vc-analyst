# Founder-name arrivals (intake defect)

An arrival that carries only a founder's name — often a WhatsApp scout note — can be ingested as
its own deal, with `company_name` set to the person. The evaluator's job does not change, but
these do:

- **Check for a sibling card before scoring.** A founder-name card and a company card for the
  same company can be created seconds apart from two channels. Scoring the founder-name card on
  its own can produce a report on a row that no longer exists once a person merges them.
- **Re-read the deal row before every write.** A person may merge or delete the card minutes
  after this run was handed it: the `reports` insert then fails on a dead foreign key and the
  `deals` update returns "Record not found". When a card is gone, score the surviving deal and
  say so in the brief.
- **A gone card whose survivor is already scored earns no report.** If the arrival's own text
  names the company and that deal already carries a report with no new evidence in the batch,
  write nothing. A person is not a company, and a survivor that is already scored does not earn
  a version off activity alone.
- **No sibling at all: the live person card is all there is to score.** Score it at the floor
  band, with every unknown dimension labelled "not known" and the brief leading on the defect.
  Do not rebuild a deleted company card out of a LinkedIn headline.
- **A person card with no company has no anchor for a profile lookup.** "Name + college +
  ex-employer" searches for a common name return hundreds of profiles and unrelated hits. A
  common name without a company to anchor it is a collision, not corroboration: leave the
  contact row empty and write no `field_sources`.
- **Never borrow the sibling's facts.** If two cards might be one company but the founder names
  differ and no source confirms it, the link is an open question, not evidence for either card.
- **A card can be deleted while a run is in flight**, and not only person cards. When the insert
  fails on a dead foreign key: write nothing, never recreate the row, and note the state in the
  per-deal file.

Scores for this shape sit in a floor band (mean ~2.0–2.3 → 40–46), with the dimension named
"not known" in the brief rather than guessed.
