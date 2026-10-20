# Session soak: first run (2026-10-19)

Status: Evidence for PRD-2026-10-19-trusted-supervision-v1, Phase B item 7, and SPEC-2026-10-19-desktop-session-soak-v1.

## Result

`pnpm run soak:desktop` launched the built app against the stub runtime in an isolated profile and drove 600 synthetic cycles
(one per second for 10 minutes: create a session, stream a message, ask and resolve a permission, publish a `session.goal`, then
remove the message and delete the session). The page stayed visible for every sample. Two minutes of warm-up were not scored.

| Metric (scored 8 minutes) | Growth per minute | First | Last | Verdict |
| ------------------------- | ----------------: | ----: | ---: | ------- |
| JS heap used              | 0.177 MiB         | 49.53 MiB | 51.22 MiB | pass (budget 2 MiB/min) |
| DOM nodes                 | 0                 | 1,855 | 1,855 | reported |
| Documents                 | 0                 | 1 | 1 | pass |
| JS event listeners        | 0                 | 500 | 500 | pass |
| Renderer RSS              | 0.52 MiB          | 416.8 MiB | 421.6 MiB | reported |
| Main process RSS          | 0.95 MiB          | 257.3 MiB | 264.4 MiB | reported |

Heap, DOM nodes and listeners are flat. Both RSS figures drift upward by a few MiB over the window. RSS has no budget in v1 and
the main-process drift (about 7 MiB in 8 minutes) was not investigated.

## The first full run failed, and the failure was not a leak

The first 10-minute run reported listeners growing by 106 per minute and ended with 257 `Permission needed` toasts on screen.
A short probe with the same frames showed no accumulation while the window was visible. A 4-minute probe that logged
`document.hidden` showed the toasts appear only after macOS hid the covered window (`document.hidden === true`), and all of
them disappeared within seconds of the page becoming visible again. A hidden window stops `requestAnimationFrame`, and the
toast library finishes a dismissal on a frame, so dismissed toasts stay in the DOM until the window is visible.

What changed in the script because of this:

- it emulates focus and brings the page to the front at start, and again whenever a sample finds the page hidden;
- every sample records `pageHidden`; a run with any hidden scored sample is reported as inconclusive with its own reason
  instead of a pass or a fail.

What it means for the product: a real window that stays hidden while permission requests arrive holds their toasts until it is
visible again. That is bounded by the number of requests and recovers on its own. It is not a leak.

## Limits

One machine, one workload shape, a stub runtime and synthetic frames. The host was heavily loaded by other work during the runs
(load average well above 100 at times), so absolute numbers are upper bounds. A pass does not prove there are no leaks, and the
run does not model a real model stream, a large history, long idle time, the packaged app or other platforms. Budgets are the
starting constants in the spec and have not been tuned.

## Reproduce

`pnpm run build`, then `pnpm run soak:desktop -- --out result.json` (about 10 minutes). `--seconds 60 --warmup 15 --interval 5`
is a smoke run. The script exits non-zero on a failed budget, an inconclusive run or an inability to sample.
