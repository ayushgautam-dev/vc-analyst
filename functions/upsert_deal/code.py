#input_type_name: UpsertDealInput
#output_type_name: UpsertDealResult
#function_name: upsert_deal

"""The single write path for deal intake.

Judgment belongs to the caller (the intake worker). This function owns the invariants:
identity resolution, fill-empty-only, closed-list validation, provenance, proposals.
The worker never writes the deals table itself.

Rules enforced here:
  1. A deal is always created. A thin arrival still becomes a card at approval_state=pending.
  2. A later, thinner sighting never overwrites a value an earlier one established.
     A genuine change to a non-empty field becomes a proposal for a human, never a write.
  3. A value outside a closed list rejects the call: the log records the failure, no deal is written.
  4. Every field written gets a field_sources row. No exceptions.
"""

from collections import defaultdict
from datetime import datetime, timezone
import re

from pydantic import BaseModel
from lemma_sdk import FunctionContext, Pod

FREEMAIL = {
    "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "yahoo.com",
    "yahoo.co.in", "icloud.com", "me.com", "aol.com", "proton.me", "protonmail.com",
    "zoho.com", "rediffmail.com", "qq.com", "163.com",
}
LEGAL = re.compile(
    r"\b(pvt|private|ltd|limited|llp|inc|incorporated|corp|corporation|co|company|"
    r"technologies|technology|tech|labs|lab|solutions|systems|ventures|holdings|group|"
    r"gmbh|bv|sa|ag|pte|plc)\b", re.I)

# Only these may be written to a deal from intake. Anything else is a mistake, not a feature.
# What the deck and the web can establish about a deal. The fund's own internals
# (owner, ic_date, decision, scores) are never written by an arrival.
DEAL_FIELDS = [
    "company_name", "one_liner", "website", "logo_url", "brief", "stage", "source",
    "referred_by", "deck_file", "gmail_thread_id", "pass_reason", "next_step",
    "sector", "geography", "business_model", "hq_city", "founded_year", "team_size",
    "funding_stage", "raising_amount", "valuation_pre_money", "total_raised",
    "lead_investor", "co_investors", "proposed_check_size", "target_ownership",
    "arr", "growth", "paying_customers", "key_metric", "data_room_url",
    "instrument", "round_status",
]
CLOSED_LISTS = ("stage", "source", "pass_reason", "funding_stage", "instrument", "round_status")

# A social or aggregator page is not a company's website, and every profile on it shares
# one domain \u2014 two founders' LinkedIn URLs would otherwise look like one company.
SOCIAL_DOMAINS = {
    "linkedin.com", "lnkd.in", "twitter.com", "x.com", "facebook.com", "instagram.com",
    "crunchbase.com", "wellfound.com", "angel.co", "angellist.com", "youtube.com",
    "medium.com", "substack.com", "t.me", "wa.me", "github.com", "calendly.com",
    "docs.google.com", "drive.google.com", "notion.site", "linktr.ee", "tracxn.com",
}
# Set once, at creation. A later sighting never overwrites or re-proposes these.
IDENTITY_FIELDS = {"company_name", "source", "gmail_thread_id"}


class ContactIn(BaseModel):
    name: str | None = None
    email: str | None = None
    phone: str | None = None
    linkedin_url: str | None = None
    role: str | None = None            # founder | referrer | other
    headline: str | None = None
    about: str | None = None
    company_name: str | None = None
    photo_url: str | None = None


class SourceIn(BaseModel):
    field_name: str
    value: str | None = None
    source_class: str                  # deck | message | research | map | human
    evidence_url: str | None = None
    evidence_note: str | None = None
    confidence: float | None = None


class ProposalIn(BaseModel):
    kind: str = "field"                # field | stage_move | duplicate | identity | reply | research | analysis | note
    field_name: str | None = None
    proposed_value: str | None = None
    current_value: str | None = None
    alternatives: list = []
    reason: str | None = None
    evidence_url: str | None = None
    source_class: str | None = None
    confidence: float | None = None


class UpsertDealInput(BaseModel):
    # ---- the arrival
    channel: str = "manual"            # email | whatsapp | manual | voice
    sender_name: str | None = None
    sender_email: str | None = None
    sender_phone: str | None = None
    subject: str | None = None
    raw_body: str | None = None
    transcript: str | None = None
    attachments: list = []
    input_type: str | None = None
    received_by: str | None = None      # the mailbox / number it arrived on — decides the owner
    is_deal: bool = True                # False = a real arrival, judged not a deal: logged, no card

    # ---- the resolved deal
    company_name: str | None = None
    one_liner: str | None = None
    brief: str | None = None
    website: str | None = None
    logo_url: str | None = None
    stage: str | None = None
    source: str | None = None
    referred_by: str | None = None
    deck_file: str | None = None
    gmail_thread_id: str | None = None
    pass_reason: str | None = None
    next_step: str | None = None

    # ---- what the deck and the web establish
    sector: str | None = None
    geography: str | None = None
    business_model: str | None = None
    hq_city: str | None = None
    founded_year: int | None = None
    team_size: int | None = None
    funding_stage: str | None = None
    raising_amount: str | None = None
    valuation_pre_money: str | None = None
    total_raised: str | None = None
    lead_investor: str | None = None
    co_investors: str | None = None
    proposed_check_size: str | None = None
    target_ownership: float | None = None
    arr: str | None = None
    growth: str | None = None
    paying_customers: int | None = None
    key_metric: str | None = None
    data_room_url: str | None = None
    instrument: str | None = None
    round_status: str | None = None

    contacts: list[ContactIn] = []
    sources: list[SourceIn] = []
    proposals: list[ProposalIn] = []

    agent_name: str = "intake"


class UpsertDealResult(BaseModel):
    intake_log_id: str | None = None
    deal_id: str | None = None
    verdict: str = "new"                # new | matched | ambiguous | skipped | failed
    created_deal: bool = False
    matched_on: str | None = None
    candidates: list = []
    fields_written: list = []
    fields_unchanged: list = []
    proposals_created: list = []
    contacts_linked: list = []
    note: str | None = None


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _empty(v) -> bool:
    if v is None:
        return True
    if isinstance(v, str):
        return not v.strip() or v.strip().lower() in {"unknown", "n/a", "null", "none", "-"}
    if isinstance(v, (list, dict)):
        return len(v) == 0
    return False


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
    if not d or d in SOCIAL_DOMAINS or any(d.endswith("." + s) for s in SOCIAL_DOMAINS):
        return None
    return d


def _clean_name(v: str | None) -> str | None:
    """A deal is named for a person or a company. A URL is neither \u2014 a LinkedIn
    profile arrives as an arrival, never as a name."""
    if _empty(v):
        return None
    s = str(v).strip()
    low = s.lower()
    if "linkedin.com" in low or "lnkd.in" in low or low.startswith("www."):
        return None
    if "@" in s and " " not in s:
        return None
    if "://" in s:
        return None
    if re.match(r"^[a-z0-9.-]+\.[a-z]{2,}/", low):
        return None
    return s


def _clean_website(url: str | None) -> str | None:
    """Only a domain that can belong to one company is worth storing."""
    if _empty(url):
        return None
    return str(url).strip() if _domain_of(url) else None


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


def upsert_deal(ctx: FunctionContext, data: UpsertDealInput) -> UpsertDealResult:
    pod = Pod.from_env()
    now = _now()

    # ---- 1. the arrival is logged before anything is decided
    log = pod.table("intake_log").create({
        "channel": data.channel if data.channel in {"email", "whatsapp", "manual", "voice"} else "manual",
        "sender_name": data.sender_name, "sender_email": data.sender_email,
        "sender_phone": data.sender_phone, "subject": data.subject,
        "raw_body": (data.raw_body or "")[:20000] or None,
        "transcript": (data.transcript or "")[:20000] or None,
        "attachments": data.attachments or [],
        "input_type": data.input_type if data.input_type in
            {"deck", "founder_name", "linkedin", "company", "forward", "question", "other"} else "other",
        "processing_status": "received", "received_by": data.received_by, "received_at": now,
    })
    log_id = str(log["id"])
    res = UpsertDealResult(intake_log_id=log_id)

    def finish(status: str, note: str | None = None, **kw):
        patch = {"processing_status": status, "note": (note or "")[:1000] or None}
        patch.update({k: v for k, v in kw.items() if v is not None})
        try:
            pod.table("intake_log").update(log_id, patch)
        except Exception:
            pass
        res.note = note
        return res

    # ---- 2. closed lists: a value outside one rejects the call
    values = {f: getattr(data, f) for f in CLOSED_LISTS}
    allowed = defaultdict(set)
    for o in _all(pod, "field_options"):
        if o.get("active") is not False and o.get("field_name") and o.get("value"):
            allowed[o["field_name"]].add(o["value"])
    bad = [f"{f}={v!r}" for f, v in values.items() if v and allowed.get(f) and v not in allowed[f]]
    if bad:
        res.verdict = "failed"
        return finish("failed", "Rejected: " + "; ".join(bad))

    # ---- 3. a real arrival that simply isn't a deal is logged and dropped
    if not data.is_deal:
        res.verdict = "skipped"
        return finish("skipped", "Judged not a deal on arrival.")

    # ---- 4. identity resolution
    data.company_name = _clean_name(data.company_name)
    data.website = _clean_website(data.website)
    deals = _all(pod, "deals")
    domain = _domain_of(data.website)
    name_key = _norm_name(data.company_name)
    sender_domain = _domain_from_email(data.sender_email)
    contact_domain = next((d for d in (_domain_from_email(c.email) for c in data.contacts) if d), None)

    match, matched_on, candidates = None, None, []
    if data.gmail_thread_id:
        match = next((d for d in deals if d.get("gmail_thread_id") == data.gmail_thread_id), None)
        if match:
            matched_on = "thread"
    if not match and domain:
        match = next((d for d in deals if _domain_of(d.get("website")) == domain), None)
        if match:
            matched_on = "domain"
    if not match and sender_domain:
        match = next((d for d in deals if _domain_of(d.get("website")) == sender_domain), None)
        if match:
            matched_on = "sender domain"
    if not match and contact_domain:
        match = next((d for d in deals if _domain_of(d.get("website")) == contact_domain), None)
        if match:
            matched_on = "founder domain"
    if not match:
        # The same person seen twice. A LinkedIn profile is an identity, and the
        # only key that survives an arrival carrying nothing but a profile link.
        arrival_profiles = {str(c.linkedin_url).rstrip("/").lower()
                            for c in data.contacts if not _empty(c.linkedin_url)}
        if arrival_profiles:
            for c in _all(pod, "contacts"):
                link = c.get("linkedin_url")
                if not link or str(link).rstrip("/").lower() not in arrival_profiles:
                    continue
                m = next((d for d in deals if str(d["id"]) == str(c.get("deal_id"))), None)
                if m:
                    match, matched_on = m, "linkedin"
                    break
    if not match and name_key and len(name_key) >= 4:
        exact = [d for d in deals if _norm_name(d.get("company_name")) == name_key]
        if exact:
            match, matched_on = exact[0], "company name"
        else:
            loose = [d for d in deals
                     if name_key and _norm_name(d.get("company_name"))
                     and (name_key in _norm_name(d.get("company_name"))
                          or _norm_name(d.get("company_name")) in name_key)]
            if loose:
                match = loose[0]           # attach, then let a human split it back out
                matched_on = "company name (ambiguous)"
                candidates = [{"deal_id": d["id"], "company_name": d.get("company_name"),
                               "stage": d.get("stage")} for d in loose]

    # ---- 5. naming ladder — never "Unknown", and only for a card being created.
    # A person's name names a new card; it never renames a card that already has a company.
    if not match and _empty(data.company_name):
        ladder = [
            (next((c.name for c in data.contacts if not _empty(c.name)), None), None),
            (domain, None),
            (contact_domain, None),
        ]
        for value, _ in ladder:
            if not _empty(value):
                data.company_name = value if isinstance(value, str) else str(value)
                data.company_name = data.company_name.replace(".", " ").title() if domain and value == domain else data.company_name
                break
        else:
            data.company_name = f"{data.channel.title()} enquiry, {now[:10]}"

    # ---- 6. write the deal: create, or fill-empty-only
    res.fields_written, res.fields_unchanged, res.proposals_created = [], [], []
    source = data.source or (data.channel if data.channel in {"email", "whatsapp", "manual"} else "manual")
    proposed = {f: getattr(data, f) for f in DEAL_FIELDS}
    proposed["source"] = source

    if not match:
        payload = {f: v for f, v in proposed.items() if not _empty(v)}
        payload.update({
            "approval_state": "pending",
            "stage": payload.get("stage") or "new",
            "source": source,
            "last_activity_at": now,
        })
        deal = pod.table("deals").create(payload)
        deal_id = str(deal["id"])
        res.deal_id, res.created_deal, res.verdict = deal_id, True, "new"
        res.fields_written = sorted(k for k in payload if k in DEAL_FIELDS)
    else:
        deal_id = str(match["id"])
        res.deal_id = deal_id
        res.verdict = "ambiguous" if candidates else "matched"
        patch = {}
        for f, v in proposed.items():
            if _empty(v):
                continue
            # Identity is settled when the record is created. A later, thinner sighting
            # never re-litigates the name it was matched on, or the channel it arrived on.
            if f in IDENTITY_FIELDS:
                # The name a card was matched on is not re-litigated \u2014 unless the arrival
                # says the company is called something else entirely, in which case a person
                # decides. This is how a card that arrived as a founder's name gets the
                # company's real name once enrichment finds it.
                if f == "company_name" and match.get(f) and _norm_name(match.get("company_name")) != _norm_name(v):
                    if not _pending_proposal(pod, deal_id, "identity", f, str(v)):
                        r = pod.table("proposals").create({
                            "deal_id": deal_id, "kind": "identity", "field_name": f,
                            "proposed_value": str(v), "current_value": str(match.get("company_name")),
                            "reason": f"This card is named '{match.get('company_name')}'. "
                                      f"This arrival says the company is '{v}'.",
                            "source_class": "research", "confidence": 0.7, "status": "pending",
                        })
                        res.proposals_created.append(str(r["id"]))
                continue
            if f == "stage":
                continue
            current = match.get(f)
            if _empty(current):
                patch[f] = v
                res.fields_written.append(f)
            elif _same_value(current, v):
                res.fields_unchanged.append(f)
            elif _pending_proposal(pod, deal_id, "field", f, str(v)):
                res.fields_unchanged.append(f)      # already awaiting a decision
            else:
                r = pod.table("proposals").create({
                    "deal_id": deal_id, "kind": "field", "field_name": f,
                    "proposed_value": str(v), "current_value": str(current),
                    "reason": f"{f} on the record reads '{current}'; this arrival says '{v}'.",
                    "source_class": "message", "status": "pending",
                })
                res.proposals_created.append(str(r["id"]))
        if patch:
            patch["last_activity_at"] = now
            pod.table("deals").update(deal_id, patch)
        else:
            pod.table("deals").update(deal_id, {"last_activity_at": now})

    # ---- 7. provenance: every written field gets a source row
    given = {}
    for s in data.sources:
        given.setdefault(s.field_name, []).append(s)
        try:
            pod.table("field_sources").create({
                "deal_id": deal_id, "field_name": s.field_name, "value": (s.value or None),
                "source_class": s.source_class, "evidence_url": s.evidence_url,
                "evidence_note": s.evidence_note, "confidence": s.confidence,
                "written_by": data.agent_name,
            })
        except Exception:
            pass
    for f in res.fields_written:
        if f in given:
            continue
        try:
            pod.table("field_sources").create({
                "deal_id": deal_id, "field_name": f, "value": str(proposed.get(f) or ""),
                "source_class": "message",
                "evidence_note": f"Written from the inbound {data.channel} arrival.",
                "confidence": 0.6, "written_by": data.agent_name,
            })
        except Exception:
            pass

    # ---- 8. contacts: dedupe on this deal, fill empty only
    existing_contacts = [c for c in _all(pod, "contacts") if str(c.get("deal_id")) == deal_id]
    linked = []
    for c in data.contacts:
        if all(_empty(x) for x in (c.name, c.email, c.phone, c.linkedin_url)):
            continue
        hit = None
        for e in existing_contacts:
            if c.email and e.get("email") and c.email.lower() == str(e["email"]).lower():
                hit = e
                break
            if c.linkedin_url and e.get("linkedin_url") and c.linkedin_url.rstrip("/").lower() == str(e["linkedin_url"]).rstrip("/").lower():
                hit = e
                break
            if c.name and e.get("name") and _norm_name(c.name) == _norm_name(e["name"]):
                hit = e
                break
        if hit:
            patch = {k: v for k, v in {
                "name": c.name, "email": c.email, "phone": c.phone, "linkedin_url": c.linkedin_url,
                "role": c.role, "about": c.about, "company_name": c.company_name,
                "photo_url": c.photo_url, "headline": c.headline,
            }.items() if not _empty(v) and _empty(hit.get(k))}
            if patch:
                pod.table("contacts").update(hit["id"], patch)
            linked.append(str(hit["id"]))
        else:
            rec = pod.table("contacts").create({
                "deal_id": deal_id, "name": c.name, "email": c.email, "phone": c.phone,
                "linkedin_url": c.linkedin_url, "role": c.role, "about": c.about,
                "photo_url": c.photo_url, "headline": c.headline,
                "company_name": c.company_name or data.company_name,
                "enrichment_status": "pending",
            })
            linked.append(str(rec["id"]))
            existing_contacts.append(rec)
    res.contacts_linked = linked
    if linked:
        try:
            fresh = pod.records.list("deals", filter=[{"field": "id", "op": "eq", "value": deal_id}],
                                     limit=1).to_dict()["items"]
            if fresh and _empty(fresh[0].get("primary_contact_id")):
                pod.table("deals").update(deal_id, {"primary_contact_id": linked[0]})
        except Exception:
            pass

    # ---- 9. the caller's own proposals
    for p in data.proposals:
        try:
            r = pod.table("proposals").create({
                "deal_id": deal_id, "kind": p.kind if p.kind in
                    {"field", "stage_move", "duplicate", "identity", "reply", "research", "analysis", "note"}
                    else "note",
                "field_name": p.field_name, "proposed_value": p.proposed_value,
                "current_value": p.current_value, "alternatives": p.alternatives,
                "reason": p.reason, "evidence_url": p.evidence_url,
                "source_class": p.source_class, "confidence": p.confidence, "status": "pending",
            })
            res.proposals_created.append(str(r["id"]))
        except Exception:
            pass

    # an ambiguous match always says so, even when the caller did not ask
    if candidates:
        try:
            r = pod.table("proposals").create({
                "deal_id": deal_id, "kind": "duplicate",
                "proposed_value": None,
                "alternatives": candidates,
                "reason": f"Matched on name only against {len(candidates)} existing record(s). "
                          "Confirm this is the same company, or split it back out.",
                "source_class": "map", "confidence": 0.4, "status": "pending",
            })
            res.proposals_created.append(str(r["id"]))
        except Exception:
            pass

    # ---- 10. the arrival is an activity, so the deal's timeline shows how it came in
    act_type = {"email": "email", "whatsapp": "whatsapp", "voice": "call"}.get(data.channel, "note")
    body = data.raw_body or data.transcript or ""
    try:
        pod.table("activities").create({
            "deal_id": deal_id,
            "type": act_type,
            "occurred_at": now,
            "title": (data.subject or f"{data.input_type or 'arrival'} via {data.channel}")[:200],
            "summary": (body[:300] + ("…" if len(body) > 300 else "")) or None,
            "participants": [c.model_dump(exclude_none=True) for c in data.contacts],
            "direction": "inbound",
            "source_ref": log_id,
        })
    except Exception:
        pass

    # ---- 11. one card per company — re-check now that the record may carry a domain
    try:
        _flag_duplicate(pod, deal_id, res)
    except Exception:
        pass

    res.matched_on = matched_on
    res.candidates = candidates
    note = (f"{'created' if res.created_deal else 'matched on ' + str(matched_on)} · "
            f"{len(res.fields_written)} field(s) written, {len(res.proposals_created)} proposal(s)")
    return finish("proposed", note, deal_id=deal_id, match_verdict=res.verdict)
