#!/usr/bin/env bash
# Set a fresh pod up, and tell whoever is watching what they can now do.
#
#   LEMMA_POD_ID=<pod> ./setup.sh
#   LEMMA_POD_ID=<pod> ./setup.sh --no-sample     # skip the sample deal flow
#
# About a minute and a half, and safe to run again. It leaves `gmail-intake` OFF — it reads
# somebody's inbox, and that is theirs to switch on (./wire-gmail.sh). The three
# automations that only react to rows inside the pod are created last, after
# the seed data is in, so they never wake an agent for a sample row.
set -euo pipefail
cd "$(dirname "$0")"
: "${LEMMA_POD_ID:?set LEMMA_POD_ID to the pod to set up}"
export LEMMA_POD_ID
SEED_ARGS=("$@")
T0=$SECONDS

WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT
imp() {  # import a staged bundle, printing its log only if it fails
  if ! lemma pods import "$@" >"$WORK/import.log" 2>&1; then
    cat "$WORK/import.log" >&2; exit 1
  fi
}

# 1. The name, first and on its own.
#
#    First, because each agent's email address is taken from the pod's name when
#    the agent is created. On its own, because `--set-pod-meta` applies metadata
#    before any resource and pod names are unique per organization: a second
#    "VC Analyst" in the same org is a 409 that would take the whole import down
#    with it. Renaming from a directory holding only pod.json cannot cost
#    anything else.
mkdir -p "$WORK/name"; cp pod.json "$WORK/name/"
if ! lemma pods import "$WORK/name" --set-pod-meta >/dev/null 2>&1; then
  echo "note: could not name this pod 'VC Analyst' — something else in this" >&2
  echo "      organization already is. Carrying on; nothing depends on it." >&2
fi

# 2. Everything except the automations.
#
#    No build: `apps/vc-analyst/source/` is built output with no package.json,
#    so the CLI uploads it as-is. --with-files brings the agents'
#    rulebook in /memory, which their instructions read first.
#
#    The automations come last (step 5), after the seed data: `evaluate-new-deal`
#    and `review-new-activity` fire on inserts, and the platform matches a row
#    event to automations a few seconds after the insert — so pausing them during
#    the seed is not enough. One that does not exist yet cannot match.
#
#    The app's address is taken from the random end of the pod id. Left to
#    itself the platform falls back to the *start* of the id when `vc-analyst`
#    is taken, and pod ids start with a timestamp — two pods made in the same
#    second would collide.
mkdir -p "$WORK/bundle"
for part in pod.json tables functions agents apps files; do
  cp -R "$part" "$WORK/bundle/"
done
SLUG="$(lemma --json apps get vc-analyst 2>/dev/null \
  | python3 -c 'import json,sys; print(json.load(sys.stdin).get("public_slug") or "")' 2>/dev/null || true)"
# A re-run keeps the address the app already has.
SLUG="${SLUG:-vc-analyst-$(printf %s "$LEMMA_POD_ID" | tr -d - | tail -c 8)}"
imp "$WORK/bundle" --with-files --var "vc_analyst_slug=$SLUG"

# 3. The connectors onboarding offers, installed on the org if they are not
#    already. Installing is not connecting: each partner still signs in with
#    their own account from the app. Granola is not here — it is an MCP
#    connector that needs a URL, so onboarding shows it as "Not set up".
ORG="$(lemma --json pods get "$LEMMA_POD_ID" | python3 -c 'import json,sys; print(json.load(sys.stdin)["organization_id"])')"
installed() {
  lemma --json --org "$ORG" connectors auth-configs list | python3 -c '
import json, sys
d = json.load(sys.stdin)
print(" ".join(c["name"] for c in (d["items"] if isinstance(d, dict) else d)))'
}
HAVE="$(installed)"
for app in gmail google_calendar; do
  case " $HAVE " in *" $app "*) continue ;; esac
  # The API has been seen to answer 500 on a create that succeeded, so trust a
  # re-read, not the status code.
  lemma --org "$ORG" connectors auth-configs create "$app" --name "$app" --kind composio >/dev/null 2>&1 || true
  case " $(installed) " in *" $app "*) ;; *)
    echo "note: could not install $app on this organization — an owner can, from Lemma." >&2 ;;
  esac
done

# 4. Starting data: option lists, you as a partner, the sample deal flow.
python3 seed/load.py "${SEED_ARGS[@]+"${SEED_ARGS[@]}"}"

# 5. The automations. The three that only react to rows inside the pod go in
#    switched on; `gmail-intake` goes in off and unrouted — ./wire-gmail.sh.
AUTO="$WORK/automations"
mkdir -p "$AUTO"
cp pod.json "$AUTO/"
cp -R schedules "$AUTO/"
# A re-run must not touch a gmail-intake that ./wire-gmail.sh already routed:
# importing it without the account would strip the routing off and pause it.
if lemma schedules get gmail-intake >/dev/null 2>&1; then
  rm -rf "$AUTO/schedules/gmail-intake"
fi
python3 - "$AUTO/schedules" <<'PY'
import json, pathlib, sys
for p in pathlib.Path(sys.argv[1]).glob("*/*.json"):
    d = json.loads(p.read_text())
    d["is_active"] = d["name"] in ("evaluate-new-deal", "rescore-on-activity", "review-new-activity")
    p.write_text(json.dumps(d, indent=2))
PY
imp "$AUTO"

# 6. Read back what actually landed, and the addresses it was given. Every
#    agent, and the pod's own assistant, is given a mailbox on creation, named
#    resend-<agent>-<suffix> — so none are declared in the bundle.
APP_URL="$(lemma --json apps get vc-analyst | python3 -c 'import json,sys; print(json.load(sys.stdin).get("url") or "the app")')"
INBOXES="$(lemma --json surfaces list | python3 -c '
import json, sys
d = json.load(sys.stdin)
# Every agent is given a mailbox when it is created, named resend-<agent>-<suffix>.
emails = {s["name"]: ((s.get("reach") or {}).get("email") or "") for s in (d["items"] if isinstance(d, dict) else d)}
def find(prefix):
    return next((e for n, e in sorted(emails.items()) if (n == prefix or n.startswith(prefix + "-")) and e), "")
rows = [(find("resend-intake"), "forward a founder intro or a deck"),
        (find("resend-deal-assistant"), "ask about a deal"),
        (find("resend-assistant"), "anything else")]
rows = [r for r in rows if r[0]]
pad = max([len(r[0]) for r in rows] or [0])
for i, (addr, what) in enumerate(rows):
    print(("  Email it  " if i == 0 else "            ") + addr.ljust(pad) + "  " + what)
')"

cat <<TXT

  VC Analyst is set up here.  ($((SECONDS - T0))s)

  Founder intros arrive by email and become deals; an agent scores each one
  against your fund's thesis and proposes what should happen next; a partner
  decides. One shared board and one thesis for the whole team.

  Open it   $APP_URL
$INBOXES

  The first time anyone opens the app it asks for the fund's website — that
  becomes the team's thesis — and has them connect their own Gmail.

  What is in it now: ten SAMPLE deals (invented companies on .example
  domains), so the inbox and pipeline are not empty. Remove them any time:

      ./seed/clear.sh

  To have intros arrive on their own, once somebody has connected Gmail:

      ./wire-gmail.sh

  Invite the team from the app, or share its link — anyone in the organization
  can join.

TXT
