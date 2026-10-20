# Main and supervision E2E reload readiness

Date: 2026-10-20. Renderer candidate: `82f8158f`; only Node harness scripts/tests change in this follow-up.
[Pre-implementation plan](../plans/PLAN-2026-10-20-supervision-reload-barrier.md).

## Failure and cause

`/tmp/ax-settings-groups-default-20261020/` reported zero supervision page targets immediately after its second Open
request, despite later approval/goal journeys using that window. The instrumentation reload acknowledged before the
old mounted board had unloaded; the readiness check could therefore accept the wrong document.

The negative controlled test retained all three delayed frames instead of observing a new document and mounted board
(`/tmp/ax-popout-barrier-negative-20261020.log`, one failed/19 passed). The fixed test explicitly observes false for the
old ready document, false for the new loading document, then true for the new ready document.

The pop-out-only change passed one complete ordinary run. An intermediate second run passed supervision but timed out
opening Settings before its later reload worked (`/tmp/ax-popout-barrier-native2-20261020/`). Main initialization had
the same gap: Page.reload followed by a shell predicate that could still see the previous root. This failed run remains
recorded, rather than being replaced by a later green result.

## Repair

The shared reloadAndWaitForReady helper records performance.timeOrigin, requests reload, and requires both a changed
origin and the caller's readiness expression. Main initialization uses the shell expression; supervision instrumentation
uses the mounted-board expression. Controlled tests cover both old-ready/new-loading transitions. CSP bindings and
collection remain intact, as does the exact one-supervision-window assertion. No fixed delay, shortcut retry, reduced
assertion or product runtime change substitutes for readiness.

## Final verification

- 21 focused harness tests passed (`/tmp/ax-reload-barrier-tests-final-20261020.log`).
- Final ordinary E2E passed twice consecutively, all 10 checks each:
  `/tmp/ax-reload-barrier-final1-20261020.log` and `/tmp/ax-reload-barrier-final2-20261020.log`. Each reports one supervision
  window after a second Open, Settings keyboard opening/reload, approval/denial clearing and synchronized goal revisions.
- Failure-detection self-test passed (`/tmp/ax-reload-barrier-self-test-final-20261020.log`): injected CSP violation,
  renderer exception and retained CSP history all failed as expected after reload; the outer self-test exited zero.
- Focused ESLint passed for cdp.mjs, journeys.mjs, run.mjs and harness.test.mjs.

The existing renderer build was reused; rebuilding unchanged application code was unnecessary. These are unpackaged
isolated-runtime checks, not a signed-package, installed-app or live-provider/MCP qualification. No user profile,
runtime pin, permission, lifecycle contract or release state was changed. Other unproven leads, including earlier
numeric focus behavior, remain outside this scoped repair; no general bug-free claim is made.
