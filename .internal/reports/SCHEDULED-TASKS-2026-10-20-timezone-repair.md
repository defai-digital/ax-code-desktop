# Recurring timezone selector repair

Scope: existing scheduling UI under the scheduled-outcomes PRD. No new runtime/SDK contract or scheduling policy.

## Reproduction

Native WebMCP opened a daily task whose stored timezone is UTC, then opened its timezone menu.
The current value displayed UTC, but no UTC option was discoverable in the open menu.
The journey failed with `Missing UI control: UTC`; its screenshot confirms the menu was open and began with
Africa/Abidjan. Artifacts: `/tmp/ax-scheduled-timezone-before-20261020/`; log:
`/tmp/ax-scheduled-timezone-before.log`.

`Intl.supportedValuesOf("timeZone")` omits UTC. The editor already had `buildTimezoneOptions`, which adds the
selected value and UTC, but only the one-time schedule branch consumed it. Daily/weekly rendering used the raw
platform list. Existing helper tests passed without covering that rendered branch.

## Repair and regression journey

Use the existing computed timezone options in the recurring branch as well. This preserves UTC and a selected
timezone absent from the platform enumeration without duplicating options.

The native WebMCP journey now selects UTC in both daily and weekly modes, returns to daily, adds a second time,
saves, reads the fixture's recorded writes independently, and reopens the family to verify both times persist.
The controlled fixture accepts project-scoped update/create requests and records their payloads. It neither
executes schedules nor calls a model provider. The test requires two distinct UTC time slots and exactly the
expected two scoped writes; native action acknowledgements alone cannot satisfy it.

## Verification

- Full UI suite: `/tmp/ax-scheduled-timezone-tests.log`, 558 files / 3,711 tests passed.
- Build: `/tmp/ax-scheduled-timezone-build.log`, all three tasks passed, including UI typecheck.
- Focused editor ESLint: `/tmp/ax-scheduled-timezone-lint.log`, passed.
- Native final journey: `/tmp/ax-scheduled-timezone-final-20261020/`, passed, including renderer/CSP checks.
  The independent receipt records one update at 09:00 UTC and one create at 12:00 UTC, both in the fixture project.
  Reopening shows two times; the inspected narrow screenshot retains the family count and readable history message.
- Boundary checks: `/tmp/ax-scheduled-timezone-boundaries.log`, passed.

## Harness startup race found during retest

The first post-build attempt failed before the timezone journey:
`/tmp/ax-scheduled-timezone-after-20261020/` records a runtime-reload timeout and Electron `ERR_ABORTED` during
initial `loadURL`. Source inspection found that runtime readiness reloaded as soon as health passed, without
waiting for initial document load completion. A health fetch can finish before that navigation.

The barrier now waits for `document.readyState === "complete"` before its first reload. The new order regression
failed before the change (`/tmp/ax-runtime-readiness-before.log`, 1 failed / 18 passed) and the harness suite
passed afterwards (`/tmp/ax-runtime-readiness-after.log`, 19 passed). The native final journey then passed.
Failure-detection self-test also passed (`/tmp/ax-scheduled-timezone-harness-selftest.log`): the intentionally
injected CSP and renderer failures remained detected after reload. Its expected FAIL lines are the self-test oracle,
not a clean-renderer qualification failure.
This prevents the observed early-reload sequence; it does not claim all startup races are eliminated.

This repair does not qualify DST gap/fold conversion, partial-create recovery, actual scheduled firing or
multi-project runtime capacity. Those remain separate acceptance items.
