# Verifying claims before scoring them

- **A relayed claim is not a fact.** A WhatsApp/forward that says "heard they just signed X" is
  hearsay. It does not raise a score, however large the name. It becomes an open question.
- **Take the claim to the source it cites.** When an arrival points at a page ("their site is
  up, it says …"), fetch that page before writing anything. A sender's description of a landing
  page can describe a different product and buyer from the page itself — and then the deal's
  stated product has no public support at all. Fetch twice when unsure (plain + full browser
  render): a JS shell reads as empty on the first pass.
- **A parked domain is a failed verification.** A website that resolves to a registrar's "for
  sale" page supports nothing; score product and market *below* the unverified baseline, not
  at it.
- **A reserved-TLD website cannot ever resolve.** `.example`, `.test` and `.invalid` are
  RFC-reserved. Treat such a site exactly like a parked domain — a failed verification, not a
  slow one — and say in the brief that the artefact is a placeholder by design. Do not spend a
  second fetch on it.
- **A name collision is not corroboration.** When desk research returns a company bearing the
  deal's name, attribute it by domain and confirm it is the same company before it touches a
  score. A same-named company on a different domain, in a different country, with a different
  product, is a stranger. "No public trace of this company" is only true once collisions are
  excluded; never let the search hit stand in as evidence either way.
- **A failed verification is a downgrade, not a null — where the artefact was the claim's only
  support.** If the one public artefact contradicts or fails to corroborate the pitch, lower the
  dimensions that depended on it (product, market) and say why. Where a check comes back
  *empty* — authwalled LinkedIn, no registry trace, no press — lower the affected dimension a
  notch and label the gap honestly; do not treat absence as proof of fabrication, and do not
  leave the score at its unverified-earlier value either. But where earlier, *read* evidence
  still stands, an absent new artefact lowers nothing (see the next point).
- **An announced artefact that never arrives is not evidence.** An email promising "the updated
  deck and our metrics" with no attachment can still fire a material-change trigger. Re-score
  as a new version, but hold the scores, lead the brief with the gap, and make "re-send it" the
  first open question. Do not move a score on the promise of a number.
- **Provenance can cite an artefact that does not exist.** A `field_sources` row may name the
  deck (`source_class = deck`, "slide 12") while `deals.deck_file` is null and no deck exists in
  the pod. Read the `field_sources` rows against the record: when provenance names a missing
  artefact, say so in the brief and treat those figures as email-body claims until it lands.
- **A discrepancy between the pitch and its own evidence is the headline**, ahead of every
  commercial question. Put it first in the brief's "what changed" and first in open questions.
- **Two arrivals, two founders, one company.** The same company can arrive twice seconds apart
  (email + WhatsApp) with a different founder named on each. When a card is a merge, the
  founder-identity question goes in the brief and the first call, never resolved by inference.
- **Say "not known" rather than infer.** Absence of a TAM, a deck, a competitive set or a
  founder's employment history is a gap to state, not a gap to fill.
- **Do not disagree with the deal's own evidence for free.** Where a number reads differently
  between versions, say which one was read this run rather than quietly overwriting the
  earlier figure.
- Distinguish what was *read* from what was *computed*: list the sources actually read for a
  version at the foot of the report, with the date.
