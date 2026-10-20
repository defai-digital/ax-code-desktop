# Partial creation recovery guard and semantic selector controls

## Evidence

The new-task save branch unconditionally called `createScheduledTasks` with the complete draft on every retry.
The API creates slots sequentially. A later failure therefore leaves earlier tasks in the runtime, while the same
editor previously accepted another full create request. The component regression failed before repair because the
second submit resolved instead of requiring recovery: `/tmp/ax-partial-create-before.log` (1 failed / 11 passed).
This is a component/API-path reproduction; native backend duplication was not claimed from that mock.

Native setup exposed an additional control defect: desktop ModelSelector and AgentSelector used `div` children
for Base UI's button trigger. The native UI tool could not discover the rendered Not selected model control:
`/tmp/ax-partial-create-native-repro2-20261020/`. Both desktop triggers now use native buttons, consistent with
the mobile model trigger; model readiness also sets the real disabled attribute.

## Repair

The creation API reports only confirmed task identities, immediately after successful create and before pause.
Missing identities and failed/unconfirmed responses are not counted as confirmed. A failed new-task creation
locks direct resubmission for that editor attempt, preserves the draft, reloads actual project tasks, and displays
the confirmed count plus a warning that tasks may already be active even without acknowledgement. The recovery
message directs the user to close the editor and review the scheduled tasks before creating again. It appears
inline instead of also covering footer controls with a toast. Opening another editor creates a new attempt;
an older operation's response cannot install its recovery message into that newer editor.

No task is adopted by title, no existing task is deleted to compensate, and no operation is automatically retried.
The failure fixture can reject before the second write or return an error after accepting that write. These cases
have different actual task counts but the same one confirmed creation; direct resubmission must be blocked in both.

## Verification

- API regression covers confirmed identity before later create or pause failure, plus malformed acknowledgement.
- Component regression rejects a second submit after creation failure without calling the creation API again.
- Initial new API tests revealed leftover one-shot mock responses; the test now resets mock implementations between
  cases rather than merely clearing call history. Focused API/sidebar tests pass after isolation.
- Full UI: 559 files / 3,725 tests passed, `/tmp/ax-partial-create-ui-final.log`.
- Focused API/sidebar: 37 tests passed, `/tmp/ax-partial-create-focused-final.log`.
- Build (including UI typecheck), lint, boundaries, 14-locale validation and 19 harness tests passed:
  `/tmp/ax-partial-create-build-final.log`, `/tmp/ax-partial-create-lint.log`,
  `/tmp/ax-partial-create-boundaries.log`, `/tmp/ax-partial-create-locales-final.log`,
  `/tmp/ax-partial-create-harness-tests-final.log`. Final harness edits also passed focused lint.
- Native normal failure: `/tmp/ax-partial-create-native-verified-20261020/`, two create attempts, one write/task.
- Native accepted-write/error-response: `/tmp/ax-partial-create-native-uncertain-20261020/`, two attempts,
  two writes/tasks, only one confirmed identity shown. Both journeys pass without additional writes, retain
  the draft and recovery message, and verify the created row remains visible after Cancel.
- Both journeys operate the model and agent selectors through native WebMCP. The isolated fixture model's
  context metadata was adjusted after an early run correctly rejected its original undersized context window;
  no real model/provider execution or user budget was involved.
- Visually inspected the normal and 800x700 recovery screenshots: the message wraps without covering Cancel,
  Save is disabled, fields remain populated, and no duplicate toast obscures the footer.
- Existing native scheduling regressions passed: history disclosure, daily/weekly UTC, two-slot save/reopen,
  DST rejection/correction, CSP and renderer checks: `/tmp/ax-partial-create-existing-schedules.log`,
  `/tmp/ax-partial-create-existing-schedules-20261020/`.

## Boundaries and remaining work

This is a per-editor recovery guard, not runtime idempotency or automatic continuation. Closing/reopening does not
retain an operation ledger. Durable operation identity, safe continuation after lost acknowledgements, atomic paused
creation, and family-edit partial-create recovery still need paired runtime/SDK contracts and qualification.
The fixture performs no real scheduler firing or provider calls. Native button discovery/clicks do not claim a full
assistive-technology or keyboard-navigation qualification.
