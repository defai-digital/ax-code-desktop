# Explain invalid one-time schedule clocks

## Reproduction and change

After the DST guard repair (`1ccff656`), selecting New York's nonexistent spring 02:30 retained the draft
and prevented writes, but displayed only the generic update-failed toast. Users could not identify the field
or understand how to correct it. The native WebMCP regression failed waiting for inline timezone guidance:
`/tmp/ax-schedule-guidance-before.log`, `/tmp/ax-schedule-guidance-before-20261020/`.

The editor now derives a one-time date/time error from the existing timezone conversion guard. It shows a
persistent, wrapping alert next to the date/time controls, names the selected timezone and suggests changing
the date, time or timezone. The schedule group and individual date/time/timezone controls reference the alert and expose invalid state. Submit validation
uses the same guard before invoking save, and correcting the time removes the alert. All 14 language catalogs
include the message with the same timezone parameter. Recurring schedules and runtime contracts are unchanged.

## Qualification

The native journey must retain the invalid draft with zero writes, expose visible guidance in normal and
800-pixel viewports, clear the alert after correction, and save 03:30 at the independently expected UTC epoch.
Source-only advisory reviews by Grok and Muse are separate from native visual/runtime evidence.

- Before: the native assertion failed waiting for actionable inline timezone guidance.
- Intermediate native checks passed, but screenshot inspection at 800x700 showed the duplicate error toast
  covering footer controls. The final implementation suppresses that toast for the already-visible field error.
- Muse's source-only review identified missing field-level accessibility links and weak viewport assertions;
  both were strengthened. Its early zero-write concern is qualified by the journey's final exact-one-write
  assertion after the corrected save: the early count alone is not the completion proof.
- The first full UI run preceded completion of all locale entries and failed eight locale cases. After all
  catalogs were updated, locale tests and `pnpm run check:locales` passed (14 locales, 4,931 keys).
- Both early full runs exposed a separate reentrancy-test import timeout, followed by a cascading assertion
  failure. The test imported unrelated store hydration/provider/worktree dependencies despite exercising only
  early repository rejection. Explicit dependency mocks now isolate that boundary; existing behavioral
  assertions and timeouts remain unchanged. The focused 25-test run passed in 2.32 seconds with no hydration
  network side effects: `/tmp/ax-schedule-guidance-focused.log`.

- Full UI after isolation and locale correction: 559 files / 3,722 tests passed,
  `/tmp/ax-schedule-guidance-ui-verified.log`.
- Final source build (including UI typecheck), lint and boundaries passed:
  `/tmp/ax-schedule-guidance-build-verified.log`, `/tmp/ax-schedule-guidance-lint-verified.log`,
  `/tmp/ax-schedule-guidance-boundaries.log`.
- [Reviewer receipts and disposition](../reviews/scheduled-time-guidance-2026-10-20/README.md): Muse completed;
  Grok timed out without output and is not counted as approval.

- Final native WebMCP: all scheduling journeys, CSP and renderer checks passed,
  `/tmp/ax-schedule-guidance-native-verified.log`, `/tmp/ax-schedule-guidance-native-verified-20261020/`.
  This includes per-field error associations, zero invalid writes, correction clearing invalid state and exactly
  one valid write at the expected epoch. The 800x700 check verifies wrapping, vertical bounds, hit testing and
  an unoccluded Save button, with no duplicate toast.
- Visually inspected `dst-invalid-draft.png` and `dst-invalid-draft-narrow.png` in that final artifact directory:
  guidance is readable beside the relevant schedule fields; footer controls remain visible and uncovered.

## Limits

This qualifies the controlled Desktop UI fixture, not real provider execution, recurring DST policy or host
recovery. The broader scheduling, recap and parallel-project qualification remains open.
