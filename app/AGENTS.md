# The app

React + Vite, on the Lemma app template. This directory is the **source**; the
bundle ships its built output in `apps/vc-analyst/source/`. Design notes are in
[`apps/vc-analyst/DESIGN.md`](../apps/vc-analyst/DESIGN.md).

## Changing it is two steps

```bash
pnpm install
pnpm run dev                 # signed in as whoever the lemma CLI is logged in as
./build.sh                   # rebuilds, rewrites ../apps/vc-analyst/source/
lemma apps deploy vc-analyst ../apps/vc-analyst/source --pod "$LEMMA_POD_ID" --yes
```

Editing here without running `./build.sh` changes nothing anyone can see.

## Local development

For `pnpm run dev`, copy `.env.example` to `.env.local` and set `VITE_LEMMA_POD_ID`
to your pod. `.env.local` is gitignored — keep it that way.

`pnpm run dev` authenticates on its own: `vite.config.ts` runs `lemma auth
print-token` and seeds it into `localStorage`, in dev only. `.env.development`
points the SDK at a same-origin `/api` that Vite proxies to the backend, because
`api.lemma.work` sends no CORS headers for `http://127.0.0.1:5173`. Vite loads
neither for `vite build`.

Nothing pod-specific may reach a build: the host injects the pod's config as
`window.__LEMMA_CONFIG__` when it serves the app. `build.sh` unsets the
`VITE_LEMMA_*` variables and fails if a uuid appears in its output.

## Calling the API

- Fetch with hooks (`useRecords`, `useLiveRecords`). Never call
  `lemmaClient.records.list(...)` during render or in a `useEffect` with unstable
  deps — that loops.
- Realtime means subscribe, never poll: `useLiveRecords` for a live list, never
  `setInterval(refetch)`.
- Give list rows a stable `key` (the row id) so they merge in place.
