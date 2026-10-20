# Scheduled task history projection repair

Scope: existing Desktop behavior under the scheduled-outcomes and parallel-project PRDs. No producer ownership,
SDK version, runtime pin, permission or scheduling policy change.

## Reproduced defects

`scheduledTasksApi.ts` inferred success from `lastRunAt` when the history request failed, returned an SDK error,
an empty history after a reported run, or an unusable payload. A timestamp proves activity, not its result.
The same projection spread the previous task error into a later completed run without clearing it.

Before repair, the focused API suite had 7 failing and 15 passing tests. One regression starts three concurrent
project loads with the same task ID, then resolves their histories out of order: running, failed and unavailable.
The unavailable project incorrectly returned success. This is a deterministic API-consumer test, not actual
parallel model execution.

## Repair

- History failure or unusable outcome becomes `unknown`, while task configuration remains usable.
- A successful history read replaces stale error text. A genuinely never-run task with a clean empty history stays idle.
- Families preserve an unavailable member's history instead of inferring success; a confirmed running member retains
  running priority. Missing history does not become a fabricated failure.
- The sidebar explicitly discloses unavailable history using the existing localized history-load message.
  Native screenshot inspection found truncation at the ordinary sidebar width; the disclosure now wraps.
- A new native WebMCP fixture journey exercises list disclosure, correct task editor selection and Cancel.
  A bounded fixture endpoint seeds list/history responses only; it does not execute prompts or activate schedules.
  Foreign directory requests receive no fixture tasks.

## Verification

- Repair-before evidence: `/tmp/ax-scheduled-status-before.log`, 7 failing regressions.
- Focused API/family/sidebar/store suites: `/tmp/ax-scheduled-status-after.log`, 71 passed.
- Full UI suite: `/tmp/ax-scheduled-ui-full.log`, 558 files / 3,711 tests passed.
- UI typecheck: `/tmp/ax-scheduled-typecheck.log`, passed.
- Focused UI ESLint: `/tmp/ax-scheduled-lint.log`, passed.
- Harness Vitest suite: `/tmp/ax-scheduled-harness.log`, 19 passed. An initial invocation with Node's test runner was
  invalid because the file imports Vitest; it was rerun with the correct package runner.
- Build: `/tmp/ax-scheduled-build.log`, all three tasks passed.
- First native journey: `/tmp/ax-scheduled-webmcp-20261020/`, passed, including CSP and renderer checks.
  The screenshot was inspected and prompted the disclosure-wrapping refinement.

- Final build after wrapping refinement: `/tmp/ax-scheduled-build-final.log`, all three tasks passed.
- Final native retest: `/tmp/ax-scheduled-webmcp-final-20261020/`, all checks passed, including the 800-pixel
  viewport disclosure assertion. `scheduled-history-narrow.png` was visually inspected: the history-load message
  wraps completely and the neighboring running row retains its state.
- Boundary checks: `/tmp/ax-scheduled-boundaries.log`, passed including endpoint/IPC contracts, source-text ratchet,
  sibling dependencies, source ownership and release identity. This does not imply signed artifact qualification.

Reproduce after build:

```sh
node desktop/packages/electron/scripts/e2e/scheduled-webmcp.mjs --artifacts /tmp/ax-scheduled-webmcp-check
```

## Remaining scope

The fixture includes three history states in one project; separate API/component regressions check concurrent
project isolation. These results do not qualify six actually executing tasks across three projects, runtime fairness,
provider/MCP isolation, host sleep/recovery, or populated portfolio UX. Those PRD acceptance journeys remain open.
Partial-create retry, atomic disabled creation, timezone behavior and recap consumption also remain under review.
No claim that all bugs have been found or the overarching goal is complete.
