#input_type_name: ReconcileDealInput
#output_type_name: ReconcileDealResult
#function_name: reconcile_deal

"""Re-check one deal for a duplicate, after its facts changed.

Intake resolves identity on what an arrival carries. An arrival that only gave a
founder's name creates a card with no domain; the domain arrives later, from
enrichment. So the check has to run again after enrichment writes company_name or
website. This function only ever raises a proposal — a human merges, never the
machine.
"""

from collections import defaultdict
from datetime import datetime, timezone
import re

from pydantic import BaseModel
from lemma_sdk import FunctionContext, Pod

FREEMAIL = {"gmail.com", "googlemail.com", "outlook.com", "hotmail.com"}
LEGAL = re.compile(r"\b(pvt|private|ltd|limited|llp|inc|corp|co|company|technologies|tech|labs|gmbh|pte)\b", re.I)


class ReconcileDealInput(BaseModel):
    deal_id: str


class ReconcileDealResult(BaseModel):
    checked: bool = False
    duplicate_of: str | None = None
    duplicate_name: str | None = None
    proposal_id: str | None = None
    note: str | None = None


def _norm_name(s: str | None) -> str:
    if not s:
        return ""
    s = LEGAL.sub(" ", str(s))
    return re.sub(r"[^a-z0-9]+", "", s.lower())


def _domain_of(url: str | None) -> str | None:
    if not url:
        return None
    u = str(url).strip().lower()
    m = re.match(r"^(?:https?://)?(?:www\.)?([a-z0-9.-]+\.[a-z]{2,})(?:[/?#].*)?$", u)
    if not m:
        return None
    d = m.group(1).strip(".")
    return d or None


def _domain_from_email(email: str | None) -> str | None:
    if not email or "@" not in str(email):
        return None
    d = str(email).rsplit("@", 1)[1].strip().lower()
    return None if d in FREEMAIL else d


def _same_value(a, b) -> bool:
    """Two sightings agree if they read the same once case and spacing are normalised.
    A file referenced by two different paths is the same file if it ends in the same name."""
    x = re.sub(r"\s+", " ", str(a).strip().lower())
    y = re.sub(r"\s+", " ", str(b).strip().lower())
    if x == y:
        return True
    if "/" in x and "/" in y and x.rsplit("/", 1)[-1] == y.rsplit("/", 1)[-1]:
        return True
    return False


def _all(pod, table, limit=1000):
    try:
        return pod.records.list(table, limit=limit).to_dict().get("items", []) or []
    except Exception:
        return []


def _pending_proposal(pod, deal_id: str, kind: str, field_name: str | None, value: str | None) -> bool:
    """The same proposal raised twice is not two decisions — it is one, shown twice."""
    for p in _all(pod, "proposals"):
        if str(p.get("deal_id")) != str(deal_id) or p.get("status") != "pending" or p.get("kind") != kind:
            continue
        if (p.get("field_name") or None) != (field_name or None):
            continue
        if _same_value(p.get("proposed_value"), value):
            return True
    return False


def _flag_duplicate(pod, deal_id: str, res):
    """One card per company. Intake matches on what the arrival carries, but an
    arrival that only gave a founder name creates a card, and enrichment adds the
    domain afterwards — after identity resolution has already run. So re-check:
    if another deal now shares this card's domain or name, the newer card says so
    and a human merges it. Never merges on its own."""
    deals = _all(pod, "deals")
    mine = next((x for x in deals if str(x.get("id")) == str(deal_id)), None)
    if not mine:
        return None
    dom = _domain_of(mine.get("website"))
    nm = _norm_name(mine.get("company_name"))
    for other in deals:
        if str(other.get("id")) == str(deal_id):
            continue
        same_dom = bool(dom) and _domain_of(other.get("website")) == dom
        same_name = bool(nm) and len(nm) >= 4 and _norm_name(other.get("company_name")) == nm
        if not (same_dom or same_name):
            continue
        pair = sorted([mine, other], key=lambda x: str(x.get("created_at") or ""))
        keep, drop = pair[0], pair[1]
        # The survivor is the card that names the company, not the one that arrived
        # as a founder's name. Failing that, whichever card came first.
        stem = (dom or "").split(".")[0]
        if stem:
            for cand in (mine, other):
                if stem and stem in _norm_name(cand.get("company_name")):
                    keep, drop = cand, (other if cand is mine else mine)
                    break
        if str(drop["id"]) != str(deal_id) and str(keep["id"]) != str(deal_id):
            continue
        if _pending_proposal(pod, str(drop["id"]), "duplicate", None, None):
            return None
        try:
            pod.table("proposals").create({
                "deal_id": str(drop["id"]), "kind": "duplicate",
                "proposed_value": keep.get("company_name"),
                "current_value": drop.get("company_name"),
                "payload": {"keep_deal_id": str(keep["id"]), "keep_name": keep.get("company_name"),
                            "matched_on": "domain" if same_dom else "company name"},
                "reason": f"{drop.get('company_name')} and {keep.get('company_name')} share the same "
                          f"{'domain' if same_dom else 'name'} — one company, two cards.",
                "source_class": "map", "confidence": 0.9, "status": "pending",
            })
            res.proposals_created.append("duplicate")
        except Exception:
            pass
        return str(keep["id"])
    return None




def reconcile_deal(ctx: FunctionContext, data: ReconcileDealInput) -> ReconcileDealResult:
    pod = Pod.from_env()
    res = ReconcileDealResult()
    mine = next((d for d in _all(pod, "deals") if str(d.get("id")) == str(data.deal_id)), None)
    if not mine:
        res.note = "No such deal."
        return res
    res.checked = True
    class _R:
        proposals_created: list = []
    _R.proposals_created = []
    keep = _flag_duplicate(pod, str(data.deal_id), _R)
    if keep:
        res.duplicate_of = keep
        res.duplicate_name = next((d.get("company_name") for d in _all(pod, "deals") if str(d.get("id")) == str(keep)), None)
        res.proposal_id = _R.proposals_created[0] if _R.proposals_created else None
        res.note = f"This card matches {res.duplicate_name} — a proposal is waiting for a human."
    else:
        res.note = "No duplicate found for this card."
    return res
