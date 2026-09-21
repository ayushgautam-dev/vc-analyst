# The setup prompt

Paste this into a fresh pod's chat. Everything it needs to know is in the repo.

```
Set this pod up from https://github.com/ayushgautam-dev/vc-analyst: clone it, run
./setup.sh, and do nothing else — no dry run, no npm, no browser, no widget, no
data you invented. Then show me what it printed, as it printed it.
```

`setup.sh` ends by printing what a person actually needs — where the app is, the
addresses the pod answers on, and what to do next. That copy lives in the script
rather than in the agent's judgement, so it reads the same every time.

The pod's own assistant can carry this out as delivered: it runs with a shell, the pod
tools and **your** permissions. There is nothing to configure first.

## Why it is written that way

Each "no" closes a detour that costs minutes and ends nowhere:

- **No npm.** The app ships built. Building it needs `VITE_LEMMA_*` variables a fresh pod
  does not have, and the build fails.
- **No browser.** Every visitor to the app meets a Lemma sign-in; an agent has no session
  to get past it.
- **No dry run.** On an unmodified checkout it finds nothing the import will not.
- **No invented data.** The sample deals are already in `seed/`, clearly marked, and
  removable with `./seed/clear.sh`.
