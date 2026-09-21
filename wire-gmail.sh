#!/usr/bin/env bash
# Point the `gmail-intake` automation at a connected Gmail account, and turn it on.
#
#   LEMMA_POD_ID=<pod> ./wire-gmail.sh               # your own Gmail
#   LEMMA_POD_ID=<pod> ./wire-gmail.sh <account-id>  # a specific account
#
# Run it once somebody has connected Gmail (the app's onboarding or Settings does
# that). Every new email in that inbox is offered to the `intake` agent, which
# turns founder intros into deals and ignores the rest.
#
# The automation is deleted and created again rather than updated: the routing
# key a webhook automation listens on is derived from the account only when the
# automation is *created*. An update that sets the account looks right and never
# fires.
set -euo pipefail
cd "$(dirname "$0")"
: "${LEMMA_POD_ID:?set LEMMA_POD_ID to the pod to wire}"
export LEMMA_POD_ID

ACCOUNT="${1:-}"
if [ -z "$ACCOUNT" ]; then
  ORG="$(lemma --json pods get "$LEMMA_POD_ID" | python3 -c 'import json,sys; print(json.load(sys.stdin)["organization_id"])')"
  ACCOUNT="$(python3 - "$ORG" <<'PY'
import json, subprocess, sys
org = sys.argv[1]
run = lambda *a: json.loads(subprocess.run(["lemma", "--json", "--org", org, *a], capture_output=True, text=True, check=True).stdout)
items = lambda d: d["items"] if isinstance(d, dict) else d
me = run("auth", "status")["id"]
cfg = {c["id"] for c in items(run("connectors", "auth-configs", "list")) if c["name"] == "gmail"}
live = [a for a in items(run("connectors", "accounts", "list", "--limit", "200"))
        if a.get("auth_config_id") in cfg and str(a.get("user_id")) == str(me)
        and str(a.get("status", "")).upper() in ("ACTIVE", "CONNECTED")]
print(live[0]["id"] if live else "")
PY
)"
fi
if [ -z "$ACCOUNT" ]; then
  echo "No connected Gmail account for you in this organization yet." >&2
  echo "Connect it from the app's Settings page, then run this again." >&2
  exit 1
fi

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/schedules"
cp pod.json "$TMP/"
cp -R schedules/gmail-intake "$TMP/schedules/"
python3 - "$TMP/schedules/gmail-intake/gmail-intake.json" <<'PY'
import json, sys
p = sys.argv[1]; d = json.load(open(p)); d["is_active"] = True
json.dump(d, open(p, "w"), indent=2)
PY

lemma schedules delete gmail-intake --yes >/dev/null 2>&1 || true
lemma pods import "$TMP" --var "gmail_intake_account=$ACCOUNT" >/dev/null
echo "gmail-intake now reads account $ACCOUNT and is on."
echo "Check it: lemma schedules get gmail-intake"
