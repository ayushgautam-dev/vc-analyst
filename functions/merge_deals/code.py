#input_type_name: MergeDealsInput
#output_type_name: MergeDealsResult
#function_name: merge_deals

"""Fold one duplicate card into the deal it matches.

A human accepts a duplicate proposal; this function does the move. Everything
that hung off the dropped card — people, provenance, history, proposals, reports —
is re-pointed at the surviving deal, empty fields are filled from the duplicate,
and the duplicate card is deleted. Nothing here decides that two cards are the
same; the decision is already made when this is called.
"""

from datetime import datetime, timezone

from pydantic import BaseModel
from lemma_sdk import FunctionContext, Pod

# Tables that hang off a deal and have to follow it when it merges.
CHILD_TABLES = [
    "contacts", "activities", "proposals", "field_sources", "reports",
    "deal_chats", "email_threads", "tasks", "suggestions", "intake_log",
]

# Filled on the survivor only when it is empty. Identity and state never move.
FILL_FIELDS = [
    "one_liner", "website", "logo_url", "brief", "sector", "geography", "business_model",
    "founded_year", "team_size", "hq_city", "raising_amount", "valuation_pre_money",
    "total_raised", "lead_investor", "co_investors", "funding_stage", "instrument",
    "round_status", "arr", "growth", "paying_customers", "key_metric", "data_room_url",
    "deck_file", "gmail_thread_id", "referred_by", "next_step", "next_step_due",
]


class MergeDealsInput(BaseModel):
    keep_id: str                      # the deal that survives
    drop_id: str                      # the duplicate card that goes away


class MergeDealsResult(BaseModel):
    merged: bool = False
    keep_id: str | None = None
    keep_name: str | None = None
    moved: dict = {}
    failed: list = []
    fields_filled: list = []
    note: str | None = None


def _all(pod, table, limit=1000):
    try:
        return pod.records.list(table, limit=limit).to_dict().get("items", []) or []
    except Exception:
        return []


def _empty(v) -> bool:
    if v is None:
        return True
    if isinstance(v, str):
        return not v.strip() or v.strip().lower() in {"unknown", "n/a", "null", "none", "-"}
    return False


def merge_deals(ctx: FunctionContext, data: MergeDealsInput) -> MergeDealsResult:
    pod = Pod.from_env()
    res = MergeDealsResult(keep_id=data.keep_id, drop_id=data.drop_id)
    deals = {str(x.get("id")): x for x in _all(pod, "deals")}
    keep, drop = deals.get(str(data.keep_id)), deals.get(str(data.drop_id))
    if not keep or not drop or str(keep["id"]) == str(drop["id"]):
        res.note = "Both deals must exist and be different."
        return res

    # ---- 1. fill what the survivor is missing
    patch = {f: drop.get(f) for f in FILL_FIELDS if _empty(keep.get(f)) and not _empty(drop.get(f))}
    if _empty(keep.get("primary_contact_id")) and not _empty(drop.get("primary_contact_id")):
        patch["primary_contact_id"] = drop["primary_contact_id"]
    if _empty(keep.get("owner")) and not _empty(drop.get("owner")):
        patch["owner"] = drop["owner"]
    if patch:
        patch["last_activity_at"] = datetime.now(timezone.utc).isoformat()
        pod.table("deals").update(str(keep["id"]), patch)
    res.fields_filled = sorted(patch)

    # ---- 2. everything that hung off the duplicate follows it
    moved, failed = {}, []
    for table in CHILD_TABLES:
        n = 0
        for row in _all(pod, table):
            if str(row.get("deal_id")) != str(drop["id"]):
                continue
            try:
                pod.table(table).update(str(row["id"]), {"deal_id": str(keep["id"])})
                n += 1
            except Exception as exc:
                failed.append(f"{table}: {type(exc).__name__}")
        if n:
            moved[table] = n
    res.moved = moved

    # ---- 3. the duplicate card is gone; its decisions are settled
    for p in _all(pod, "proposals"):
        if str(p.get("deal_id")) == str(drop["id"]) and p.get("status") == "pending":
            try:
                pod.table("proposals").update(str(p["id"]),
                                              {"status": "accepted", "resolved_value": "merged"})
            except Exception:
                pass
    try:
        pod.table("deals").delete(str(drop["id"]))
        res.merged = True
    except Exception as exc:
        res.note = (f"Moved {sum(moved.values())} row(s) into “{keep.get('company_name')}”, but the duplicate "
                    f"card could not be deleted ({type(exc).__name__}). Something still points at it.")
        return res
    res.keep_name = keep.get("company_name")

    try:
        pod.table("activities").create({
            "deal_id": str(keep["id"]), "type": "note",
            "occurred_at": datetime.now(timezone.utc).isoformat(),
            "title": f"Merged duplicate card “{drop.get('company_name')}” into this deal",
            "summary": "Both cards described the same company. People, provenance and history moved here.",
            "direction": "internal",
        })
    except Exception:
        pass

    if failed:
        moved["_failed"] = failed
    res.note = (f"“{drop.get('company_name')}” merged into “{keep.get('company_name')}” · "
                f"{sum(moved.values())} row(s) moved, {len(res.fields_filled)} field(s) filled")
    return res
