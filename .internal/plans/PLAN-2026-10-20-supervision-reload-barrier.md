# Supervision harness reload readiness repair

Date: 2026-10-20. Authorized regression diagnosis under the active WebMCP bug-finding/test goal.
During final Settings regression, ordinary E2E reported zero supervision targets immediately after a second open;
later approval/goal journeys used the pop-out successfully. Preserve `/tmp/ax-settings-groups-default-20261020/`.

Source lead: instrumentSupervisionPopout reloads the page but its caller only checks whether the board exists. CDP's
reload acknowledgement does not establish a new document; the old mounted board can satisfy that check during reload.

1. Add a controlled regression with an old mounted document, a new document before board mount, then a ready board.
2. Require a changed performance.timeOrigin and a mounted board after instrumentation. Keep CSP instrumentation and
   the exact one-window assertion; do not hide duplicates or loosen failure checks.
3. Run focused harness tests and two ordinary native E2E passes on the already-built candidate. No product, lifecycle,
   SDK/runtime, permissions or release change is planned. Record any contradictory evidence instead of labeling it flaky.

Follow-up: `/tmp/ax-popout-barrier-native2-20261020/` passed supervision but failed its first Settings keyboard journey;
Settings worked after the later reload. The main harness's initial Page.reload has the same missing new-document
barrier: its subsequent shell check can accept the previous mounted root. Share the tested reload/readiness helper
between main initialization and pop-out instrumentation. Preserve the failed run and verify two fresh complete runs.
