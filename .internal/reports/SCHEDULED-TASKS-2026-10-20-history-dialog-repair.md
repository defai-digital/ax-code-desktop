# Keep unavailable run history distinct from empty history

## Reproduction

The sidebar already disclosed an unavailable latest-run response, but the history API adapter converted a
non-array response into `[]` and silently dropped invalid records. Opening that same task's history therefore
claimed "This task hasn't run yet." A malformed member of a multi-slot family could also disappear from an
otherwise successful summary.

- API regressions before repair: 9 failed / 26 passed, `/tmp/ax-history-malformed-before.log`.
- Native WebMCP before repair: `/tmp/ax-history-malformed-native-repro-20261020/`,
  `/tmp/ax-history-malformed-native-repro.log`; the history-unavailable assertion failed.
- The failure screenshot was inspected: the sidebar says it cannot load history while the dialog claims the
  task has never run. An earlier setup attempt could not see hover-only row actions; opening/cancelling the
  editor returns keyboard focus to the row and exposes the existing focus-within controls without DOM mutation.

## Repair

The history adapter now rejects non-array responses and any invalid record instead of producing an empty or
silently incomplete history. Required record identity, recognized status and a finite, representable creation
time are checked. A supplied task identity must match the requested task. Missing task identity retains the
existing fallback to the request identity for compatible responses. A genuinely empty array remains valid.

The existing dialog error/retry UI receives these errors; there is no new runtime state or scheduler. The native
journey opens history through its row menu, checks the unavailable alert, changes the controlled response to a
valid failed run, clicks Retry, and verifies that actual run appears and the alert clears. It then restores the
fixture and runs the existing timezone/multi-slot/DST regression journeys.

## Verification

- Full UI: 559 files / 3,735 tests passed, `/tmp/ax-history-malformed-ui.log`.
- Build (including UI typecheck), lint and boundary checks passed: `/tmp/ax-history-malformed-build.log`,
  `/tmp/ax-history-malformed-lint.log`, `/tmp/ax-history-malformed-boundaries.log`.
- Native WebMCP passed history error/retry recovery, daily/weekly UTC, multi-slot save/reopen, DST rejection
  and correction, CSP and renderer checks: `/tmp/ax-history-malformed-native-final.log`,
  `/tmp/ax-history-malformed-native-final-20261020/`.
- Visually inspected `history-unavailable.png` and `history-recovered.png`: error and Retry are visible; the
  recovered view presents the actual failed run and failure detail rather than an empty-state claim.
- Unit coverage distinguishes genuine empty arrays from absent/malformed responses, rejects invalid records
  and mismatched task identities, and rejects an invalid family member instead of hiding it in a summary.

## Scope

This qualifies the consumer projection and native fixture UI. It does not prove real provider execution or
runtime recovery. Unknown future statuses require a matching producer/SDK/consumer update rather than silently
being counted as successful or omitted. The broader scheduling and parallel-project work remains open.
