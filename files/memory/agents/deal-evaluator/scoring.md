# How a score is derived

- Five dimensions, one score each on a 0–5 scale: `team`, `market`, `product`, `traction`,
  `thesis_fit`, written to both the `deals` row and the `reports` row.
- `score_overall` (0–100) is the **equal-weighted mean of the five, ×20, rounded** — a mean of
  3.1 is 62.
- `thesis_flags` comes from the fund's `thesis` row: one key per `deal_breaker: true` entry in
  stages / geographies / sectors, with the reason in the value. A flag is never a veto.
- A re-score is a **new report version**; the previous version is never edited.
- Set `field_sources` rows for every score changed, `source_class = research`, naming the
  evidence URL — guardrail 6 (provenance or it did not happen).
- A score only moves on new *evidence*, not on new activity. A metric relayed by a third
  party is not evidence until it is corroborated (see `verification.md`).
