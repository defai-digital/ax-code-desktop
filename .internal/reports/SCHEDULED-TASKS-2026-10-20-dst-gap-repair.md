# Reject nonexistent one-time schedule clocks

Scope: the scheduling PRD's time-boundary matrix. Existing UI and legacy migration transforms only;
no new scheduler, runtime schema, provider request or recurring activation.

## Reproduced behavior

The UI's iterative timezone conversion returned an epoch even when no instant could represent the selected
wall clock. The legacy migration's Luxon conversion also reported a normalized instant as valid.
The runtime receives an epoch only and cannot recover the user's original wall-clock intent to reject the shift.

Four regressions failed independently in each transform before repair:

- New York 2027-03-14 02:30 (one-hour gap).
- Berlin 2027-03-28 02:30 (one-hour gap).
- Lord Howe 2027-10-03 02:15 (half-hour gap).
- Apia 2011-12-30 12:00 (skipped calendar day).

The native WebMCP reproduction edited a future New York one-time fixture from 01:30 to 02:30.
The editor closed without retaining the invalid draft. Its projected epoch matched the original 01:30, so
reconciliation performed no write: this was a silently accepted, discarded edit rather than a new backend write.
The failure screenshot shows the editor closed and the sidebar retaining 01:30.

Evidence: `/tmp/ax-schedule-dst-ui-before.log` (4 failed / 16 passed),
`/tmp/ax-schedule-dst-web-before.log` (4 failed / 22 passed), and
`/tmp/ax-schedule-dst-native-before-20261020/` (invalid-draft retention failed).

## Repair

The UI now formats the candidate epoch back into the selected timezone and rejects it unless it matches the
requested wall clock. Migration similarly requires Luxon's formatted date/time to round-trip without normalization.
Invalid migration records follow the existing non-history skip/report path rather than being activated at a shifted
instant. Already-migrated runtime tasks are not rewritten.

Tests preserve valid instants on either side of the New York gap and allow an actual instant for the autumn repeated
hour. This does not introduce an earlier/later fold selection policy; that product question remains separate.

## Verification

- Full UI: `/tmp/ax-schedule-dst-ui-after.log`, 558 files / 3,717 tests passed.
- Full Web: `/tmp/ax-schedule-dst-web-after.log`, 139 files / 1,457 tests passed, 2 skipped.
- Initial repair build and lint passed: `/tmp/ax-schedule-dst-build.log`, `/tmp/ax-schedule-dst-lint.log`.
- Post-repair native WebMCP passed boot, history disclosure, daily/weekly UTC, two-slot save/reopen,
  invalid DST draft retention with zero writes, corrected instant, CSP and renderer checks:
  `/tmp/ax-schedule-dst-native-final-20261020/`.
- User follow-up: capture the system timezone once at renderer startup and reuse it for new schedules;
  saved recurring timezones remain unchanged. UTC handles missing/failed detection. Reload refreshes the default.
- Focused startup/editor/transform tests: `/tmp/ax-startup-timezone-tests.log`, 3 files / 32 tests passed.
  The module test changes detected system timezone between imports and verifies one detection; the editor
  regression creates multiple drafts and edits saved recurrence without another detection.
- Startup-timezone candidate build, lint and boundary checks passed: `/tmp/ax-startup-timezone-build.log`,
  `/tmp/ax-startup-timezone-lint.log`, `/tmp/ax-startup-timezone-boundaries.log`.
- First native follow-up passed DST but attempted family reopening during dialog exit, when the background
  controls were still hidden from accessibility: `/tmp/ax-startup-timezone-native-20261020/`.
  The harness now waits for the exact edit control to leave the hidden/inert subtree before the native click.
- Final native WebMCP suite passed all journeys, CSP and renderer checks:
  `/tmp/ax-startup-timezone-native-final-20261020/`, `/tmp/ax-startup-timezone-native-final.log`.
  Focused harness lint also passed after the readiness correction.

The native journey uses an isolated browser timezone and a controlled fixture. It must retain an invalid 02:30 draft
with zero writes, then save corrected 03:30 as the independently expected UTC epoch. Real scheduler firing is not
claimed by this UI/transform qualification.

## Remaining UX scope

The existing editor uses its generic update-failed feedback for invalid transformed schedules. More specific inline
date/time guidance remains an improvement item; this patch prevents silent time changes and preserves the editable draft.
Recurring DST policy, host catch-up/recovery, and the broader parallel-project matrix remain open.

## Follow-up

[Time guidance repair](SCHEDULED-TASKS-2026-10-20-time-guidance.md) addresses the generic-error UX item above
with inline feedback and field associations. Its own report records the later candidate and verification scope.
