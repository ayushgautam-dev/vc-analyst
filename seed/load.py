#!/usr/bin/env python3
"""Load the pod's starting data. Run by ./setup.sh; safe to run again.

    LEMMA_POD_ID=<pod> python3 seed/load.py            # config + sample deal flow
    LEMMA_POD_ID=<pod> python3 seed/load.py --no-sample # config only

Three kinds of rows, and only one of them is pretend:

  config/   the option lists behind every picker (stage, instrument, pass reason…).
            Real configuration, not sample data; loaded only into an empty table.
  you       whoever runs this goes into `team` and becomes an `owner` option, so
            the pod knows one partner by name from the start.
  sample/   ten invented deals with founders, activity, proposals and three
            reports — so nobody opens a blank inbox. Every one is on a `.example`
            domain and `referred_by: "Sample data"`. ./seed/clear.sh removes them.

Sample dates are shifted so the newest activity is yesterday, whenever this runs.

Run it before the automations exist (setup.sh does): `evaluate-new-deal` and
`review-new-activity` fire on every insert, and waking two agents per sample row
would be slow, would spend LLM budget, and would rewrite the sample.
"""
import json
import os
import re
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta
from pathlib import Path

HERE = Path(__file__).parent
ANCHOR = date(2026, 9, 21)  # must match build_sample.py
SHIFT = timedelta(days=(date.today() - ANCHOR).days)
DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
DATETIME = re.compile(r"^\d{4}-\d{2}-\d{2}T[\d:.]+Z$")


def lemma(*args: str) -> str:
    out = subprocess.run(["lemma", "--json", *args], capture_output=True, text=True)
    if out.returncode != 0:
        raise RuntimeError(f"lemma {' '.join(args)}: {out.stderr.strip() or out.stdout.strip()}")
    return out.stdout


def rows_in(table: str, limit: int = 1) -> list:
    data = json.loads(lemma("records", "list", table, "--limit", str(limit)))
    return data.get("items", []) if isinstance(data, dict) else data


def shift(value):
    if isinstance(value, str):
        if DATE.match(value):
            return (date.fromisoformat(value) + SHIFT).isoformat()
        if DATETIME.match(value):
            t = datetime.fromisoformat(value.replace("Z", "+00:00")) + SHIFT
            return t.isoformat().replace("+00:00", "Z")
    return value


def load(table: str, rows: list) -> str:
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
        json.dump(rows, f)
    try:
        lemma("records", "import", table, f.name)
    finally:
        os.unlink(f.name)
    return f"{table}: {len(rows)}"


def load_config() -> list:
    done = []
    if not rows_in("field_options"):
        done.append(load("field_options", json.loads((HERE / "config" / "field_options.json").read_text())))
    return done


def load_you() -> list:
    """The person running setup, as a partner and as a deal owner."""
    me = json.loads(lemma("auth", "status"))
    name = " ".join(filter(None, [me.get("first_name"), me.get("last_name")])).strip() or me.get("email", "")
    if not name:
        return []
    done = []
    team = rows_in("team", 200)
    if not any(r.get("display_name") == name for r in team):
        done.append(load("team", [{"display_name": name, "role": "Partner",
                                   "emails": [me["email"]] if me.get("email") else [], "active": True}]))
    owners = [r for r in rows_in("field_options", 300) if r.get("field_name") == "owner"]
    if not any(r.get("value") == name for r in owners):
        done.append(load("field_options", [{"field_name": "owner", "value": name, "sort_order": 0, "active": True}]))
    return done


def load_sample() -> list:
    files = sorted((HERE / "sample").glob("*.json"))
    tables = [(re.sub(r"^\d+-", "", p.stem), json.loads(p.read_text())) for p in files]
    tables = [(t, [{k: shift(v) for k, v in r.items()} for r in rows]) for t, rows in tables]

    first_deal = tables[0][1][0]["id"]
    if any(r.get("id") == first_deal for r in rows_in("deals", 500)):
        return ["sample: already loaded"]

    # deals and contacts first; everything else only references deals, so it can
    # all go at once.
    done = [load(*tables[0]), load(*tables[1])]
    with ThreadPoolExecutor(max_workers=6) as pool:
        done += list(pool.map(lambda tr: load(*tr), tables[2:]))
    return done


def main() -> int:
    if not os.environ.get("LEMMA_POD_ID"):
        print("set LEMMA_POD_ID to the pod to load", file=sys.stderr)
        return 2
    done = load_config() + load_you()
    if "--no-sample" not in sys.argv:
        done += load_sample()
    print("loaded  " + " · ".join(done) if done else "nothing to load")
    return 0


if __name__ == "__main__":
    sys.exit(main())
