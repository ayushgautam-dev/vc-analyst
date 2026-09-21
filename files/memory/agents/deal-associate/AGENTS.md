# deal-associate — index

Per-deal notes worth carrying across runs live in `deals/` — one file per deal, named for the
company, holding only what a later run needs.

- `concurrency.md` — parallel runs on one deal race: re-check `proposals` at insert time, raise nothing if a sibling already did.
