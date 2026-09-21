#input_type_name: WebResearchInput
#output_type_name: WebResearchResult
#function_name: web_research

import re
from concurrent.futures import ThreadPoolExecutor
from html.parser import HTMLParser
from urllib.parse import parse_qs, urlparse

import httpx
from pydantic import BaseModel
from lemma_sdk import FunctionContext

MONID_RUN = "https://api.monid.ai/v1/run"
DDG_HTML = "https://html.duckduckgo.com/html/"
UA = "Mozilla/5.0 (compatible; LemmaResearch/1.0)"
PAGE_CAP = 15000


class WebResearchInput(BaseModel):
    query: str
    purpose: str = "market"  # market | competitor | company | people
    num_results: int = 8
    fetch_top_n: int = 2
    recency_minutes: int | None = None  # 1440 day, 10080 week, 43200 month


class ResearchItem(BaseModel):
    title: str
    url: str
    published_at: str | None = None
    snippet: str | None = None


class ResearchPage(BaseModel):
    url: str
    text: str


class WebResearchResult(BaseModel):
    query: str
    purpose: str
    results: list[ResearchItem] = []
    pages: list[ResearchPage] = []
    cost_usd: float = 0.0
    provider: str = "monid-tinyfish"


# Provider keys are PERSONAL. `/me` resolves to the *calling* user's own
# namespace, so each member uploads their own key to `/me/keys/<name>.txt` and
# nobody can read anyone else's. This pod is shared by a whole team, so a
# pod-level `/keys/` folder would hand one person's paid API key to everyone —
# that is why it is not used here. `/keys/` is still read as a fallback so a pod
# that still keeps a shared key there goes on working.
#
# Returns None rather than raising: a member with no key of their own is the
# normal case, not an error, and `web_research` falls back to DuckDuckGo.
def _key(pod, name: str) -> str | None:
    for path in (f"/me/keys/{name}.txt", f"/keys/{name}.txt"):
        try:
            value = pod.files.download(path).decode().strip()
            if value:
                return value
        except Exception:
            continue
    return None


# ---------------------------------------------------------------- monid path

def _monid_run(client: httpx.Client, key: str, endpoint: str,
               body: dict | None = None, query: dict | None = None) -> dict:
    inp = {}
    if body:
        inp["body"] = body
    if query:
        inp["queryParams"] = query
    resp = client.post(MONID_RUN, headers={"Authorization": f"Bearer {key}"},
                       json={"provider": "tinyfish", "endpoint": endpoint,
                             "input": inp})
    if resp.status_code not in (200, 202):
        raise RuntimeError(f"monid {endpoint} {resp.status_code}: {resp.text[:200]}")
    payload = resp.json()
    if payload.get("status") == "RUNNING" and payload.get("runId"):
        import time as _t
        end = _t.time() + 60
        while _t.time() < end:
            _t.sleep(3)
            r = client.get(f"https://api.monid.ai/v1/runs/{payload['runId']}",
                           headers={"Authorization": f"Bearer {key}"})
            if r.status_code == 200:
                payload = r.json()
                if payload.get("status") in ("COMPLETED", "FAILED", "BLOCKED"):
                    break
        else:
            raise RuntimeError(f"monid {endpoint} run timed out")
    if payload.get("status") and payload.get("status") != "COMPLETED":
        raise RuntimeError(f"monid {endpoint} ended {payload.get('status')}")
    return payload


def _research_monid(key: str, data: WebResearchInput) -> WebResearchResult:
    cost = 0.0
    with httpx.Client(timeout=30) as c:
        q = {"query": data.query, "purpose": data.purpose}
        if data.recency_minutes:
            q["recency_minutes"] = data.recency_minutes
        search = _monid_run(c, key, "/search", query=q)
        cost += search.get("cost_usd") or 0.0
        sres = search.get("output") or search.get("result") or {}
        raw = sres.get("results") or sres.get("data") or []
        items = [ResearchItem(
            title=r.get("title") or "", url=r.get("url") or "",
            published_at=r.get("published_at") or r.get("date"), snippet=r.get("snippet"),
        ) for r in raw if r.get("url")]

        pages = []
        fetchable = [i for i in items if "linkedin.com" not in i.url][:max(0, data.fetch_top_n)]

        def _fetch(item):
            fc = httpx.Client(timeout=30)
            try:
                f = _monid_run(fc, key, "/fetch", {"urls": [item.url], "format": "markdown",
                                                   "purpose": data.purpose})
                fres = f.get("output") or f.get("result") or {}
                if isinstance(fres, dict) and isinstance(fres.get("results"), dict):
                    fres = fres["results"].get(item.url) or {}
                elif isinstance(fres, dict) and isinstance(fres.get("results"), list) and fres["results"]:
                    fres = fres["results"][0]
                text = (fres.get("markdown") or fres.get("content")
                        or fres.get("text") or "") if isinstance(fres, dict) else ""
                return ResearchPage(url=item.url, text=text[:PAGE_CAP]) if text else None
            except Exception:
                return None
            finally:
                fc.close()

        if fetchable:
            with ThreadPoolExecutor(max_workers=len(fetchable)) as pool:
                for pg in pool.map(_fetch, fetchable):
                    if pg:
                        pages.append(pg)

    return WebResearchResult(query=data.query, purpose=data.purpose,
                             results=items, pages=pages, cost_usd=cost,
                             provider="monid-tinyfish")


# ----------------------------------------------------- duckduckgo fallback

class _Strip(HTMLParser):
    """Collapse an HTML document into readable plain text."""

    SKIP = {"script", "style", "noscript", "svg", "head", "nav", "footer"}
    BREAK = {"p", "br", "div", "li", "tr", "h1", "h2", "h3", "h4", "h5", "section"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.skipping = 0

    def handle_starttag(self, tag, attrs):
        if tag in self.SKIP:
            self.skipping += 1
        elif tag in self.BREAK:
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in self.SKIP and self.skipping:
            self.skipping -= 1

    def handle_data(self, data):
        if not self.skipping:
            chunk = data.strip()
            if chunk:
                self.parts.append(chunk)

    def text(self) -> str:
        joined = " ".join(self.parts)
        joined = re.sub(r"[ \t]{2,}", " ", joined)
        return re.sub(r"(\s*\n\s*){2,}", "\n\n", joined).strip()


def _html_to_text(raw: str) -> str:
    parser = _Strip()
    try:
        parser.feed(raw)
    except Exception:
        pass
    return parser.text()


def _ddg_unwrap(href: str) -> str:
    """DDG links are wrapped as //duckduckgo.com/l/?uddg=<urlencoded target>."""
    if "uddg=" in href:
        absolute = href if href.startswith("http") else "https:" + href
        target = parse_qs(urlparse(absolute).query).get("uddg")
        if target:
            return target[0]
    if href.startswith("//"):
        return "https:" + href
    return href


_RESULT_RE = re.compile(
    r'<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>(.*?)</a>',
    re.S | re.I)
_SNIPPET_RE = re.compile(
    r'<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>(.*?)</a>', re.S | re.I)


def _ddg_recency(minutes: int | None) -> str | None:
    """Map recency_minutes onto DuckDuckGo's coarser d/w/m/y filter."""
    if not minutes:
        return None
    if minutes <= 1440:
        return "d"
    if minutes <= 10080:
        return "w"
    if minutes <= 43200:
        return "m"
    return "y"


def _ddg_fetch(url: str) -> ResearchPage | None:
    try:
        with httpx.Client(timeout=30, follow_redirects=True) as c:
            r = c.get(url, headers={"User-Agent": UA})
            r.raise_for_status()
            if "html" not in r.headers.get("content-type", "").lower():
                return None
            text = _html_to_text(r.text)
            return ResearchPage(url=url, text=text[:PAGE_CAP]) if text else None
    except Exception:
        return None


def _research_duckduckgo(data: WebResearchInput) -> WebResearchResult:
    """Keyless fallback for members who have not added a Monid key.

    Weaker than TinyFish — no live browser, so pages behind JS or a login come
    back thin or empty — but it needs no key, costs nothing, and keeps research
    working for every member of a shared pod.
    """
    params: dict[str, str] = {"q": data.query}
    window = _ddg_recency(data.recency_minutes)
    if window:
        params["df"] = window

    items: list[ResearchItem] = []
    with httpx.Client(timeout=30, follow_redirects=True) as c:
        resp = c.get(DDG_HTML, params=params, headers={"User-Agent": UA})
        resp.raise_for_status()
        snippets = _SNIPPET_RE.findall(resp.text)
        for i, (href, title) in enumerate(_RESULT_RE.findall(resp.text)):
            url = _ddg_unwrap(href)
            if not url.startswith("http"):
                continue
            items.append(ResearchItem(
                title=_html_to_text(title)[:300],
                url=url,
                snippet=_html_to_text(snippets[i])[:500] if i < len(snippets) else None,
            ))
            if len(items) >= max(1, data.num_results):
                break

    pages: list[ResearchPage] = []
    fetchable = [i for i in items if "linkedin.com" not in i.url][:max(0, data.fetch_top_n)]
    if fetchable:
        with ThreadPoolExecutor(max_workers=len(fetchable)) as pool:
            pages = [p for p in pool.map(_ddg_fetch, [i.url for i in fetchable]) if p]

    return WebResearchResult(query=data.query, purpose=data.purpose,
                             results=items, pages=pages, cost_usd=0.0,
                             provider="duckduckgo")


def web_research(ctx: FunctionContext, data: WebResearchInput) -> WebResearchResult:
    # No personal Monid key is the normal case for an invited member, so fall
    # straight through to the keyless provider instead of failing the research.
    key = _key(ctx.pod, "monid")
    if not key:
        return _research_duckduckgo(data)
    try:
        return _research_monid(key, data)
    except Exception:
        # A bad or exhausted key should degrade, not kill the deal evaluation.
        return _research_duckduckgo(data)
