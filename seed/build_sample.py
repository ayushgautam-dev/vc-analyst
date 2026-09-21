#!/usr/bin/env python3
"""Write the sample deal flow in seed/sample/*.json.

    python3 seed/build_sample.py

Every company, person and number here is invented, and says so: companies live on
the reserved `.example` domain, and every deal is `referred_by: "Sample data"`.
The point is that nobody opens a blank inbox — not to pass as real deal flow.

Ids are fixed (uuid5 of a name), so `seed/clear.sh` can remove exactly these rows
and nothing a person or an agent wrote. Dates are written relative to ANCHOR;
`seed/load.py` shifts them so the sample always looks recent.
"""
import json
import uuid
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ANCHOR = date(2026, 9, 21)
NS = uuid.UUID("6f1d3c2a-9b7e-4c55-8d0a-5a3e2b1c0f99")
OUT = Path(__file__).parent / "sample"
SAMPLE = "Sample data"


def uid(*parts: str) -> str:
    return str(uuid.uuid5(NS, "/".join(parts)))


def day(offset: int) -> str:
    return (ANCHOR + timedelta(days=offset)).isoformat()


def at(offset: int, hour: int = 10) -> str:
    t = datetime(ANCHOR.year, ANCHOR.month, ANCHOR.day, hour, tzinfo=timezone.utc)
    return (t + timedelta(days=offset)).isoformat().replace("+00:00", "Z")


# --------------------------------------------------------------------- deals
# (key, company, one-liner, stage, approval, funding stage, sector, geography, city)
DEALS = [
    # Inbox — just arrived, waiting on a partner
    ("ledgerline", "Ledgerline", "Accounts-payable automation for mid-market manufacturers.",
     "new", "pending", "seed", "Fintech", "India", "Pune"),
    ("kiln", "Kiln Health", "Scheduling and follow-up for multi-location dental clinics.",
     "new", "pending", "pre_seed", "Healthtech", "India", "Bengaluru"),
    ("tidewater", "Tidewater Freight", "Freight audit that catches carrier overbilling before it is paid.",
     "new", "pending", "seed", "Logistics", "Southeast Asia", "Singapore"),
    # Pipeline
    ("brightloom", "Brightloom Labs", "Evaluation harness for teams shipping LLM features.",
     "screening", "approved", "seed", "Developer tools", "United States", "San Francisco"),
    ("quarry", "Quarry Security", "Finds and revokes leaked cloud credentials in minutes.",
     "first_meeting", "approved", "seed", "Security", "India", "Hyderabad"),
    ("parcelcraft", "Parcelcraft", "Returns management for D2C brands, from label to refund.",
     "diligence", "approved", "series_a", "Commerce infrastructure", "India", "Mumbai"),
    ("fernhollow", "Fernhollow Bio", "Soil-microbe inputs that cut fertiliser use for rice farmers.",
     "ic_review", "approved", "seed", "Agritech", "India", "Chennai"),
    ("stackwise", "Stackwise", "Usage-based billing for API companies.",
     "invested", "approved", "seed", "Developer tools", "India", "Bengaluru"),
    ("moonrail", "Moonrail", "Consumer app for splitting group travel costs.",
     "passed", "approved", "pre_seed", "Consumer", "United Kingdom", "London"),
    ("orbitdesk", "Orbitdesk", "Help desk for field-service teams, run from WhatsApp.",
     "parked", "approved", "pre_seed", "Vertical SaaS", "India", "Jaipur"),
]

DETAIL = {
    "ledgerline": dict(source="email", score_overall=None, raising_amount="$2M", round_status="open",
                       brief="Founder intro by email. Ledgerline reads supplier invoices, matches them to purchase orders and goods receipts, and queues payments. Early pilots with three auto-component makers."),
    "kiln": dict(source="email", raising_amount="$600K", round_status="open", instrument="safe",
                 brief="Inbound from the founder. Kiln books, reminds and re-books patients across clinic chains; claims 11 clinics live."),
    "tidewater": dict(source="email", raising_amount="$3M", round_status="open",
                      brief="Warm intro from a portfolio founder. Tidewater audits freight invoices against contracted rates and flags overbilling before payment."),
    "brightloom": dict(source="email", score_overall=64, score_team=3.5, score_market=3.5, score_product=3.0,
                       score_traction=2.5, score_thesis_fit=3.5, raising_amount="$4M", arr="$180K",
                       growth="12% MoM", paying_customers=14, business_model="SaaS",
                       next_step="Reference call with two design partners", next_step_due=day(3),
                       brief="Test suites for LLM features that run in CI. Strong founding pair, crowded category; the question is whether evaluation stays a standalone product."),
    "quarry": dict(source="email", score_overall=71, score_team=4.0, score_market=3.5, score_product=3.5,
                   score_traction=3.0, score_thesis_fit=4.0, raising_amount="$3.5M", arr="$240K",
                   growth="9% MoM", paying_customers=22, business_model="SaaS",
                   next_step="First meeting with both founders", next_step_due=day(2),
                   brief="Scans repos, CI logs and chat for leaked cloud keys and revokes them automatically. Founders previously ran incident response at a large cloud provider."),
    "parcelcraft": dict(source="email", score_overall=78, score_team=4.0, score_market=4.0, score_product=4.0,
                        score_traction=4.0, score_thesis_fit=4.0, raising_amount="$8M", valuation_pre_money="$32M",
                        arr="$1.4M", growth="7% MoM", paying_customers=140, business_model="SaaS + per-return fee",
                        key_metric="Net revenue retention 128%", lead_investor="Undecided", proposed_check_size="$1.5M",
                        target_ownership=0.06, round_status="open", instrument="equity",
                        next_step="Customer calls — three brands from the data room", next_step_due=day(5),
                        brief="Returns portal, reverse-logistics routing and refunds for D2C brands. Clear retention story; diligence is on unit economics of the per-return fee."),
    "fernhollow": dict(source="manual", score_overall=74, score_team=4.5, score_market=3.5, score_product=3.5,
                       score_traction=3.0, score_thesis_fit=4.0, raising_amount="$2.5M", proposed_check_size="$750K",
                       target_ownership=0.08, round_status="closing", instrument="equity", ic_date=day(4),
                       next_step="IC memo circulated; partners vote at IC", next_step_due=day(4),
                       brief="Biological inputs for paddy that cut urea use by roughly a fifth in two seasons of field trials. Team of agronomists with a distribution partner signed."),
    "stackwise": dict(source="email", score_overall=81, score_team=4.5, score_market=4.0, score_product=4.0,
                      score_traction=4.0, score_thesis_fit=4.5, total_raised="$3M", lead_investor="Your fund",
                      arr="$900K", paying_customers=65, round_status="closed", instrument="equity",
                      brief="Metering and invoicing for API-first companies. Invested in the seed round; board observer seat."),
    "moonrail": dict(source="email", score_overall=38, score_team=3.0, score_market=2.0, score_product=3.0,
                     score_traction=1.5, score_thesis_fit=1.0, pass_reason="thesis_mismatch",
                     thesis_flags={"sectors": "Consumer social is outside the fund's B2B focus"},
                     brief="Well-made consumer product; outside the thesis and pre-traction."),
    "orbitdesk": dict(source="manual", score_overall=55, score_team=3.5, score_market=3.0, score_product=3.0,
                      score_traction=2.0, score_thesis_fit=3.0, next_step="Check back after their pilot with a telecom installer",
                      next_step_due=day(45),
                      brief="Tickets, dispatch and customer updates for field technicians, all inside WhatsApp. Too early — revisit after the pilot."),
}

# (deal, name, role, title)
FOUNDERS = [
    ("ledgerline", "Meera Kulkarni", "founder", "Co-founder & CEO"),
    ("kiln", "Arjun Rao", "founder", "Founder"),
    ("tidewater", "Wei Ling Tan", "founder", "Co-founder & CEO"),
    ("brightloom", "Sam Okafor", "founder", "Co-founder & CEO"),
    ("quarry", "Nikhil Varma", "founder", "Co-founder & CTO"),
    ("parcelcraft", "Priya Menon", "founder", "Founder & CEO"),
    ("fernhollow", "Dr. Kavya Iyer", "founder", "Co-founder & Chief Scientist"),
    ("stackwise", "Rohan Desai", "founder", "Co-founder & CEO"),
    ("moonrail", "Hannah Price", "founder", "Founder"),
    ("orbitdesk", "Imran Sheikh", "founder", "Founder"),
]


def build():
    names = {k: company for k, company, *_ in DEALS}
    deals, contacts = [], []
    for n, (key, company, liner, stage, approval, fstage, sector, geo, city) in enumerate(DEALS, 1):
        slug = company.lower().replace(" ", "")
        row = dict(id=uid("deal", key), company_name=company, one_liner=liner,
                   website=f"https://{slug}.example", stage=stage, approval_state=approval,
                   funding_stage=fstage, sector=sector, geography=geo, hq_city=city,
                   referred_by=SAMPLE, primary_contact_id=uid("contact", key),
                   last_activity_at=at(-n))
        row.update({k: v for k, v in DETAIL[key].items() if v is not None})
        if approval == "pending":
            row["proposed_stage"] = "screening"
        deals.append(row)

    for key, name, role, title in FOUNDERS:
        company = names[key]
        first = name.replace("Dr. ", "").split()[0].lower()
        contacts.append(dict(id=uid("contact", key), name=name, role=role, company_name=company,
                             deal_id=uid("deal", key), headline=f"{title}, {company}",
                             email=f"{first}@{company.lower().replace(' ', '')}.example",
                             enrichment_status="done",
                             about=f"{title} at {company}. (Sample person — invented for the demo.)"))

    def act(key, n, typ, offset, title, summary, direction="inbound"):
        return dict(id=uid("activity", key, str(n)), deal_id=uid("deal", key), type=typ,
                    occurred_at=at(offset, 9 + n), title=title, summary=summary, direction=direction)

    activities = [
        act("ledgerline", 1, "email", -1, "Intro: Ledgerline — AP automation, raising $2M seed",
            "Meera wrote in with a deck. Three pilots with auto-component makers, paid pilots converting next quarter."),
        act("kiln", 1, "email", -1, "Kiln Health — deck and a short demo video",
            "Inbound. 11 clinics live across two chains; asking for a first call next week."),
        act("tidewater", 1, "email", -2, "Intro from a portfolio founder: Tidewater Freight",
            "Warm intro. Claims 2.1% of audited freight spend recovered for current customers."),
        act("brightloom", 1, "meeting", -6, "Screening call with Sam",
            "Walked through the CI integration. 14 paying teams; most expansion comes from adding eval suites per feature.", "internal"),
        act("brightloom", 2, "email", -3, "Brightloom — customer list for references",
            "Sam shared two design partners who agreed to take a reference call."),
        act("quarry", 1, "email", -4, "Quarry Security — raising $3.5M seed",
            "Deck plus a SOC-2 roadmap. Median time from leak to revocation: under four minutes."),
        act("parcelcraft", 1, "meeting", -12, "First meeting — Priya and the COO",
            "Returns volume up 3x in a year; per-return fee is now 40% of revenue.", "internal"),
        act("parcelcraft", 2, "email", -5, "Parcelcraft data room",
            "Data room opened: cohort retention, unit economics by brand size, customer list."),
        act("parcelcraft", 3, "note", -2, "Diligence note",
            "Retention is strong; open question is whether the per-return fee holds for the largest brands.", "internal"),
        act("fernhollow", 1, "meeting", -15, "Field visit — trial plots",
            "Second-season trial data looks consistent with the first.", "internal"),
        act("fernhollow", 2, "note", -1, "IC memo drafted",
            "Memo circulated to partners ahead of IC.", "internal"),
        act("stackwise", 1, "email", -9, "Stackwise monthly update",
            "ARR crossed $900K; two enterprise pilots signed.", "inbound"),
        act("moonrail", 1, "email", -20, "Passing on Moonrail",
            "Sent a kind pass: consumer is outside the thesis.", "outbound"),
        act("orbitdesk", 1, "call", -30, "Intro call with Imran",
            "Pilot with a telecom installer starts next month; asked to reconnect after it.", "internal"),
    ]

    def prop(key, n, kind, field, value, current, reason, source="message", conf=0.8):
        return dict(id=uid("proposal", key, str(n)), deal_id=uid("deal", key), kind=kind, field_name=field,
                    proposed_value=value, current_value=current, reason=reason, source_class=source,
                    confidence=conf, status="pending")

    proposals = [
        prop("ledgerline", 1, "stage_move", "stage", "screening", "new",
             "Inside the thesis on sector and stage, with paid pilots — worth a screening call."),
        prop("tidewater", 1, "field", "raising_amount", "$3M", None,
             "The intro email says they are raising a $3M seed.", "message", 0.9),
        prop("brightloom", 1, "field", "arr", "$210K", "$180K",
             "Sam's latest email reports $210K ARR, up from $180K on the deck.", "message", 0.85),
        prop("parcelcraft", 1, "stage_move", "stage", "ic_review", "diligence",
             "All three customer calls are done and the data room checks out — ready for IC.", "human", 0.7),
    ]

    def report(key, overall, s):
        radar = {"Team": s[0], "Market": s[1], "Product": s[2], "Traction": s[3], "Thesis fit": s[4]}
        scores = {"team": s[0], "market": s[1], "product": s[2], "traction": s[3], "thesis_fit": s[4], "overall": overall}
        d = next(x for x in deals if x["id"] == uid("deal", key))
        content = (f"# {d['company_name']} — report v1\n\n"
                   f"*Sample report, invented for the demo.*\n\n## Brief\n\n{d['brief']}\n\n"
                   "## Why it could work\n\n- The team has done this before.\n- Customers expand once they are in.\n\n"
                   "## What would have to be true\n\n- The pricing holds at larger customers.\n- Distribution scales beyond the first region.\n\n"
                   "## Thesis fit\n\nInside the fund's stage and sector focus.\n")
        return dict(id=uid("report", key), deal_id=d["id"], version=1, content=content, radar=radar, scores=scores)

    reports = [report("parcelcraft", 78, [4.0, 4.0, 4.0, 4.0, 4.0]),
               report("fernhollow", 74, [4.5, 3.5, 3.5, 3.0, 4.0]),
               report("quarry", 71, [4.0, 3.5, 3.5, 3.0, 4.0])]

    def src(key, field, value, cls, note, conf=0.9):
        return dict(id=uid("source", key, field), deal_id=uid("deal", key), field_name=field, value=value,
                    source_class=cls, evidence_note=note, confidence=conf, written_by="sample")

    field_sources = [
        src("parcelcraft", "arr", "$1.4M", "deck", "Deck, slide 9 (sample)"),
        src("parcelcraft", "paying_customers", "140", "deck", "Deck, slide 9 (sample)"),
        src("parcelcraft", "key_metric", "Net revenue retention 128%", "message", "Data-room cohort sheet (sample)"),
        src("quarry", "arr", "$240K", "deck", "Deck, slide 7 (sample)"),
        src("brightloom", "arr", "$180K", "deck", "Deck, slide 6 (sample)"),
        src("stackwise", "arr", "$900K", "message", "Monthly update email (sample)"),
    ]

    OUT.mkdir(exist_ok=True)
    # Written in load order: a row's foreign keys always exist before it does.
    for n, (table, rows) in enumerate([("deals", deals), ("contacts", contacts), ("activities", activities),
                                        ("proposals", proposals), ("reports", reports),
                                        ("field_sources", field_sources)], 1):
        (OUT / f"{n}-{table}.json").write_text(json.dumps(rows, indent=1, ensure_ascii=False) + "\n")
        print(f"{table}: {len(rows)}")


if __name__ == "__main__":
    build()
