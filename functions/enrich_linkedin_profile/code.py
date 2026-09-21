#input_type_name: EnrichLinkedInInput
#output_type_name: EnrichLinkedInResult
#function_name: enrich_linkedin_profile

import time
import httpx
from pydantic import BaseModel
from lemma_sdk import FunctionContext, Pod

MONID_RUN = "https://api.monid.ai/v1/run"
BD_TRIGGER = "https://api.brightdata.com/datasets/v3/trigger"
BD_SNAPSHOT = "https://api.brightdata.com/datasets/v3/snapshot"
BD_LINKEDIN_DATASET = "gd_l1viktl72bvl7bjuj0"  # LinkedIn profiles


class EnrichLinkedInInput(BaseModel):
    linkedin_url: str
    provider: str = "auto"  # auto | brightdata | monid


class ExperienceItem(BaseModel):
    title: str | None = None
    company: str | None = None
    duration: str | None = None
    is_current: bool = False


class EnrichLinkedInResult(BaseModel):
    name: str | None = None
    headline: str | None = None
    current_title: str | None = None
    current_company: str | None = None
    location: str | None = None
    about: str | None = None
    email: str | None = None
    experience: list[ExperienceItem] = []
    education: list[str] = []
    skills: list[str] = []
    connections: int | None = None
    followers: int | None = None
    photo_url: str | None = None
    provider_used: str = ""
    cost_usd: float = 0.0
    raw: dict = {}


# Provider keys are PERSONAL. `/me` resolves to the *calling* user's own
# namespace, so each member uploads their own key to `/me/keys/<name>.txt` and
# nobody can read anyone else's. This pod is shared by a whole team, so a
# pod-level `/keys/` folder would hand one person's paid API key to everyone —
# that is why it is not used here. `/keys/` is still read as a fallback so a pod
# that still keeps a shared key there goes on working.
def _key(pod, name: str) -> str | None:
    for path in (f"/me/keys/{name}.txt", f"/keys/{name}.txt"):
        try:
            value = pod.files.download(path).decode().strip()
            if value:
                return value
        except Exception:
            continue
    return None


# Enrichment has no keyless provider — scraping a LinkedIn profile needs a paid
# one — so a missing key is a real stop here, unlike in `web_research`, which
# falls back to DuckDuckGo. Say plainly whose key is missing and where it goes.
def _read_key(pod: Pod, name: str) -> str:
    value = _key(pod, name)
    if not value:
        raise RuntimeError(
            f"no {name} API key for this user. Add your own at "
            f"/me/keys/{name}.txt (Files -> me -> keys). Keys are personal: "
            f"yours stays visible only to you."
        )
    return value


def _norm_skills(skills) -> list[str]:
    out = []
    for s in skills or []:
        out.append((s.get("name") or s.get("title")) if isinstance(s, dict) else str(s))
    return [x for x in out if x]


def _norm_education(edu) -> list[str]:
    out = []
    for e in edu or []:
        if isinstance(e, dict):
            parts = [e.get("title") or e.get("school"), e.get("degree"), e.get("field")]
            out.append(" - ".join(p for p in parts if p))
        else:
            out.append(str(e))
    return [x for x in out if x]


def _map_brightdata(r: dict) -> EnrichLinkedInResult:
    exp = [ExperienceItem(
        title=e.get("title"), company=e.get("company"),
        duration=e.get("duration") or e.get("date_range"),
        is_current=bool(e.get("is_current")) or not (e.get("ends_at")),
    ) for e in (r.get("experience") or [])]
    cc = r.get("current_company")
    return EnrichLinkedInResult(
        name=r.get("name") or " ".join(x for x in [r.get("first_name"), r.get("last_name")] if x) or None,
        headline=r.get("headline") or r.get("position"),
        current_title=r.get("current_title") or r.get("position") or (exp[0].title if exp and exp[0].is_current else None),
        current_company=(cc if isinstance(cc, str) else (cc or {}).get("name")) or r.get("current_company_name"),
        location=r.get("location") or r.get("city"),
        about=r.get("about") or r.get("summary"),
        email=r.get("email"),
        experience=exp,
        education=_norm_education(r.get("education")),
        skills=_norm_skills(r.get("skills")),
        connections=r.get("connections") if isinstance(r.get("connections"), int) else r.get("connections_count"),
        followers=r.get("followers") if isinstance(r.get("followers"), int) else r.get("followers_count"),
        photo_url=r.get("avatar") or r.get("profile_pic") or r.get("profilePic") or r.get("profile_picture"),
        provider_used="brightdata",
        cost_usd=0.0015,
        raw=r,
    )


def _map_apify(r: dict, cost: float) -> EnrichLinkedInResult:
    def _dur(e):
        a, b = e.get("jobStartedOn"), e.get("jobEndedOn")
        if a or b:
            return f"{a or '?'} -> {b or 'present'}"
        return None
    exp = [ExperienceItem(
        title=e.get("title"), company=e.get("companyName") or e.get("company"),
        duration=_dur(e), is_current=bool(e.get("jobStillWorking")) or not e.get("jobEndedOn"),
    ) for e in (r.get("experiences") or [])]
    current = next((e for e in exp if e.is_current), None)
    edu = []
    for e in (r.get("educations") or []):
        if isinstance(e, dict):
            parts = [e.get("title") or e.get("schoolName"), e.get("subtitle")]
            txt = " - ".join(x for x in parts if x)
            if txt:
                edu.append(txt)
        elif e:
            edu.append(str(e))
    return EnrichLinkedInResult(
        name=r.get("fullName") or " ".join(x for x in [r.get("firstName"), r.get("lastName")] if x) or None,
        headline=r.get("headline"),
        current_title=r.get("jobTitle") or (current.title if current else None),
        current_company=r.get("companyName") or (current.company if current else None),
        location=r.get("addressWithCountry") or r.get("addressWithoutCountry"),
        about=r.get("about"),
        email=r.get("email"),
        experience=exp,
        education=edu,
        skills=[(x.get("title") if isinstance(x, dict) else str(x)) for x in (r.get("skills") or [])],
        connections=r.get("connectionsCount") if isinstance(r.get("connectionsCount"), int) else None,
        followers=r.get("followersCount") if isinstance(r.get("followersCount"), int) else None,
        photo_url=r.get("profilePicture") or r.get("profilePic") or r.get("profile_pic") or r.get("pictureUrl"),
        provider_used="monid-apify",
        cost_usd=cost or 0.015,
        raw=r,
    )


def _enrich_brightdata(key: str, url: str) -> EnrichLinkedInResult:
    with httpx.Client(timeout=30) as c:
        trig = c.post(BD_TRIGGER, params={"dataset_id": BD_LINKEDIN_DATASET},
                      headers={"Authorization": f"Bearer {key}"}, json=[{"url": url}])
        if trig.status_code != 200:
            raise RuntimeError(f"brightdata trigger {trig.status_code}: {trig.text[:200]}")
        snap = trig.json().get("snapshot_id")
        if not snap:
            raise RuntimeError(f"brightdata: no snapshot_id in {trig.text[:200]}")
        deadline = time.time() + 100
        while time.time() < deadline:
            time.sleep(4)
            poll = c.get(f"{BD_SNAPSHOT}/{snap}", params={"format": "json"},
                         headers={"Authorization": f"Bearer {key}"}, timeout=60)
            if poll.status_code != 200:
                continue
            body = poll.json()
            if isinstance(body, list) and body:
                return _map_brightdata(body[0])
            if isinstance(body, dict) and isinstance(body.get("data"), list) and body["data"]:
                return _map_brightdata(body["data"][0])
        raise RuntimeError("brightdata: snapshot not ready within 100s")



def _monid_poll(client, key, run_id, deadline_s=90):
    import time as _t
    end = _t.time() + deadline_s
    while _t.time() < end:
        _t.sleep(3)
        r = client.get(f"https://api.monid.ai/v1/runs/{run_id}",
                       headers={"Authorization": f"Bearer {key}"})
        if r.status_code != 200:
            continue
        body = r.json()
        if body.get("status") in ("COMPLETED", "FAILED", "BLOCKED"):
            return body
    raise RuntimeError(f"monid run {run_id} did not complete in time")

def _enrich_monid(key: str, url: str) -> EnrichLinkedInResult:
    with httpx.Client(timeout=120) as c:
        resp = c.post(MONID_RUN, headers={"Authorization": f"Bearer {key}"}, json={
            "provider": "apify", "endpoint": "/dev_fusion/linkedin-profile-scraper",
            "input": {"body": {"profileUrls": [url]}},
        })
        if resp.status_code not in (200, 202):
            raise RuntimeError(f"monid run {resp.status_code}: {resp.text[:200]}")
        payload = resp.json()
        if payload.get("status") == "RUNNING" and payload.get("runId"):
            payload = _monid_poll(c, key, payload["runId"])
        if payload.get("status") and payload.get("status") != "COMPLETED":
            raise RuntimeError(f"monid run ended {payload.get('status')}")
        result = payload.get("output") or payload.get("result") or {}
        if isinstance(result, list):
            rows = result
        else:
            rows = result.get("results") or result.get("data") or []
        if not rows:
            raise RuntimeError("monid: no profile rows returned")
        return _map_apify(rows[0], payload.get("cost_usd") or 0.015)


def enrich_linkedin_profile(ctx: FunctionContext, data: EnrichLinkedInInput) -> EnrichLinkedInResult:
    pod = ctx.pod
    errors = []
    if data.provider in ("auto", "monid"):
        try:
            return _enrich_monid(_read_key(pod, "monid"), data.linkedin_url)
        except Exception as e:
            errors.append(f"monid: {e}")
            if data.provider == "monid":
                raise
    if data.provider in ("auto", "brightdata"):
        try:
            return _enrich_brightdata(_read_key(pod, "brightdata"), data.linkedin_url)
        except Exception as e:
            errors.append(f"brightdata: {e}")
            if data.provider == "brightdata":
                raise
    raise RuntimeError("all providers failed - " + " | ".join(errors))
