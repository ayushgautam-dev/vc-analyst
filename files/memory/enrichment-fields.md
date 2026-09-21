# Which fields the web can answer

The line between what a search can find and what only the deck or the founder can tell us.
Read this before spending a lookup. Crunchbase, Tracxn and press coverage mostly have this
right for **late** stages and are mostly empty or stale for pre-seed — which is who we see.

## Never search the web for these

They exist in the deck or in the founder's own words, and nowhere else at this stage. A search
returns a number belonging to a different company, or a stale one. Blank beats wrong.

    valuation_pre_money   proposed_check_size   target_ownership   total_raised
    arr                   growth                paying_customers    key_metric
    instrument            round_status          data_room_url       raising_amount

And the fund's own internals, which no agent ever sets from a lookup at all:

    ic_date   decision   next_step   next_step_due   stage   owner   pass_reason   referred_by

## Safe to find on the web

Take these from a page you actually read, first source that answers, then stop.

    website        logo_url      one_liner     sector        business_model
    hq_city        geography     founded_year  team_size     lead_investor / co_investors

People, which is what a partner actually reads:

    linkedin_url   photo_url   role   headline   about   experience   education
    a founder's prior companies

`one_liner` comes from the company's own copy, not from a directory's summary.
`team_size` and `founded_year` come from the company's own about page when it has one.
`lead_investor` / `co_investors` only from a funding announcement, never guessed, and only
for rounds that were announced.

## Human only

    stage   owner   pass_reason   referred_by   relationship notes   decision

## The order of operations

1. The deck is read first and it wins. A number in the deck is never replaced by a number on
   the web.
2. Enrichment runs only for the fields above that are still **empty** after the deck.
3. A field on the never-search list is never looked up, not even when it is empty.
4. Every value written from a lookup gets a `field_sources` row with `source_class` of
   `research` (or `map` when it came from a directory) and the URL it came from.
5. No source found means the field stays empty. That is a fine outcome and costs nothing more.

## What LinkedIn enrichment actually returns (measured 2026-09-17)

Two providers behind `enrich_linkedin_profile`, both keyed from `/me/keys/`:

- `brightdata` — $0.0015/profile. Name, photo, current company, education, location, followers.
- `monid-apify` — $0.015/profile, and it fails on some profiles (`monid: no profile rows
  returned`, e.g. a valid co-founder profile it could not read). Adds headline, about text,
  full experience history, skills. Falls back to brightdata on failure.

Neither returns an **email address**. A run over seven founders produced zero emails. So an
email is never an enrichment result: it comes from the deck, the message, or a human. Do not
report a contact as "enrichable" on the strength of a missing email.

Also: brightdata's payload carries `current_company`, which can differ from the company on the
deal — a founder who has moved on shows up under the new company. That is a diligence signal
for a person to read, not a field to overwrite silently.
