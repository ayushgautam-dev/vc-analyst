#!/usr/bin/env bash
# Rebuild the app and publish its output as the bundle's app source.
#
#   ./app/build.sh
#
# `apps/vc-analyst/source/` is a prebuilt static site, not a Vite project, and
# that is why a fresh pod sets up in seconds: the CLI picks how to deploy an app
# by what it finds there. A package.json means "build it" — install, build, and
# three VITE_LEMMA_* variables a fresh pod has never had. An index.html with no
# package.json means "upload as-is". The bundle ships the second.
#
# Nothing pod-specific may be baked in. The Lemma host injects
# window.__LEMMA_CONFIG__ when it serves the app, so the same bytes work in any
# pod — but Vite WOULD inline a VITE_LEMMA_POD_ID from your shell or a
# forgotten .env.local, and this repository is public. So the build runs with
# those unset, and refuses to finish if an id slipped through anyway.
set -euo pipefail
cd "$(dirname "$0")"
OUT="../apps/vc-analyst/source"

[ -d node_modules ] || pnpm install --frozen-lockfile

# `vite build` loads .env.local on its own, whatever the shell says — move the
# local env files out of its way for the length of the build.
STASH="$(mktemp -d)"
restore() { for f in "$STASH"/.env*; do [ -e "$f" ] && mv "$f" .; done; rm -rf "$STASH"; }
trap restore EXIT
for f in .env .env.local .env.production .env.production.local; do
  [ -e "$f" ] && mv "$f" "$STASH/"
done

env -u VITE_LEMMA_API_URL -u VITE_LEMMA_AUTH_URL -u VITE_LEMMA_POD_ID \
    -u VITE_LEMMA_APP_NAME -u VITE_LEMMA_APP_BASE_PATH \
    pnpm run build

rm -rf "$OUT"
mkdir -p "$OUT"
cp -R dist/. "$OUT"/

# A pod id in the shipped bundle would be published to a public repository.
if grep -rqE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' "$OUT"; then
  echo "refusing: build output contains a uuid — check your environment" >&2
  exit 1
fi
echo "wrote $OUT"
