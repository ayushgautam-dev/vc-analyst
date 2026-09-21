#!/usr/bin/env bash
# Remove the sample deal flow, and nothing else.
#
#   LEMMA_POD_ID=<pod> ./seed/clear.sh
#
# Deletes exactly the rows in seed/sample/ by their fixed ids, children before
# the deals they point at. Anything a person or an agent wrote — including edits
# to a sample deal's own children — is left alone. The option lists and the
# `team` row setup added are real configuration and stay.
set -euo pipefail
cd "$(dirname "$0")"
: "${LEMMA_POD_ID:?set LEMMA_POD_ID to the pod to clear}"
export LEMMA_POD_ID

python3 - <<'PY'
import json, re, subprocess
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

files = sorted(Path("sample").glob("*.json"), reverse=True)   # children first
removed = 0
for p in files:
    table = re.sub(r"^\d+-", "", p.stem)
    ids = [r["id"] for r in json.loads(p.read_text())]
    def rm(i):
        return subprocess.run(["lemma", "records", "delete", table, i, "--yes"],
                              capture_output=True, text=True).returncode == 0
    with ThreadPoolExecutor(max_workers=8) as pool:
        removed += sum(pool.map(rm, ids))
print(f"removed {removed} sample rows")
PY
