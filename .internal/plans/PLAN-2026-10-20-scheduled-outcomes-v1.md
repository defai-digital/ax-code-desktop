# Scheduled outcomes implementation plan v1

Status: Proposed review and repair plan; no new scheduled-task product code has been written.
[PRD](../prd/PRD-2026-10-20-scheduled-outcomes-v1.md) ·
[source review](../reports/SCHEDULED-TASKS-2026-10-20-review.md).
This extends the WebMCP/recap plan with scheduling; preserve the existing producer/consumer boundaries.

## 1. Freeze evidence and contracts

- Trace editor → payload transform/family reconciliation → scoped runtime API → events/polling → row/history/result.
- Inspect the exact published SDK and pinned runtime contracts for outcome metadata, session links, paused create,
  idempotency, retry semantics, catch-up, overlap and execution-host lifetime. Record absent capabilities.
- Classify each finding as confirmed implementation behavior, reproduced UI defect, product gap or contract risk.
  A passing existing test can encode an undesirable behavior and is not product acceptance.

## 2. Establish a safe native fixture journey

- Extend the isolated E2E stub with stateful scheduled-task list/create/update/pause/resume/delete/Run now/history and
  explicit fault injection. The current stub's empty list cannot qualify scheduled execution.
- Drive the actual editor/sidebar/history through native WebMCP. Use temporary projects/tasks and a controllable clock;
  never register real recurring jobs or spend model tokens during fault tests.
- Independently inspect emitted API requests, stored fixture tasks, run records and rendered states. Stub qualification
  stays separate from live pinned-runtime qualification and actual scheduled firing.

| Area | Required cases |
| --- | --- |
| Lifecycle | Create/edit/cancel/pause/resume/Run now/history/delete; loading/empty/error/retry |
| Identity | Project switch/removal; task/family changed while editor is open; late async results |
| Partial operations | Multi-slot create/update/pause/delete failure at each stage; retry and uncertain acknowledgements |
| Time | Daily/weekly/once; UTC and non-listed selected zone; DST gap/fold; past time; restart and catch-up |
| Execution | Running/completed/failed/timeout/skipped_overlap/missed_skip; approval-needed and missing provider |
| Projection | Unavailable history; stale errors after successful run; unknown versus completed versus verified |
| Return | Restart/reopen → correct result/session/evidence → recap and next action |
| Host | App closed/runtime stopped/machine asleep; document verified behavior and limitations |

## 3. Repair existing defects

- First reproduce the timestamp-based success fallback, including rejected and SDK `{ error }` history responses. Preserve
  list usability while making unknown outcome explicit; update the regression that currently expects success on failure.
- Reproduce partial-create retry duplication in the native fixture. Define operation identity/reconciliation with the
  runtime contract; do not adopt arbitrary same-title tasks or add a competing Desktop retry engine.
- Check recurring timezone menus against the selected/UTC option helper; verify the actual menu, not just the helper.
- Verify disabled creation against the producer's atomicity guarantee. A UI-only create-then-pause sequence cannot
  guarantee the task was never runnable. Record paired ADR/spec work if the public contract needs to change.
- Retest lifecycle, failure and narrow-window presentation after each repair. No scheduled source change precedes the
  applicable PRD/ADR/spec requirements.

## 4. Deliver scheduled outcomes

- Define producer/consumer result identity, run/session/evidence links, verification status and freshness in accepted
  records before extending the contract. Use runtime facts and existing permissions/cancellation/budget controls.
- Implement one fixture-backed WebMCP check and one return-to-work recap path. Explain unavailable app/browser/auth
  instead of retrying uncertain side effects or inferring success.
- Add editable templates only after an explicit activation preview and reliable result/recovery loop exist.
- Compare outcomes and review burden with the baseline; defer event-trigger/cloud breadth until the first slice is useful.

## 5. Validation and commit

Run focused lifecycle/API/timezone/history/store tests, full UI tests for project-action interactions, typecheck/lint/build,
locale/boundary checks, native fixture and runtime qualification where available. Preserve failed receipts and list unrun
host/live-provider cases. Commit scheduling changes separately from Settings repairs, without unrelated runtime pins,
reference edits, SDK migration, automatic job activation, push or publication.

## Concurrent-run qualification (user follow-up, 2026-10-20)

Prioritize simultaneous scheduled tasks in one project and across projects. Inspect the pinned runtime's concurrency,
overlap and queue contracts, then test bursts with running/queued/blocked/completed/failed/cancelled outcomes. Measure
UI responsiveness, API fan-out, refresh convergence and correct task/run/project attribution. Verify a failure, pause,
cancel or late update for one run cannot corrupt another. Separate deterministic Desktop fixture evidence from real
pinned-runtime execution, and never infer runtime parallelism from simultaneous UI spinners. Use controlled local
provider/test workloads for runtime qualification where supported, without activating user jobs or paid model requests.

## Repair evidence

- [History projection](../reports/SCHEDULED-TASKS-2026-10-20-history-repair.md): no timestamp-based false success,
  stale error cleanup, visible unavailable state, concurrent consumer tests and native WebMCP verification.
- [Recurring timezone](../reports/SCHEDULED-TASKS-2026-10-20-timezone-repair.md): native UTC-option reproduction,
  daily/weekly repair and two-slot save/reopen receipt. Includes the startup reload race found during retesting.
- [Runtime dispatch](../reports/PARALLEL-PROJECTS-2026-10-20-runtime-dispatch.md): six scheduled tasks across three
  real project instances with a controlled prompt boundary. Provider/MCP and packaged execution remain unqualified.

- [DST gaps and startup timezone](../reports/SCHEDULED-TASKS-2026-10-20-dst-gap-repair.md): reject nonexistent
  one-time wall clocks in the editor and migration; capture the default system timezone once per renderer lifetime.
- [Invalid-time guidance](../reports/SCHEDULED-TASKS-2026-10-20-time-guidance.md): actionable inline date/time
  feedback, field accessibility, narrow-dialog visibility, correction recovery and native save receipts.
- [Partial-create recovery guard](../reports/SCHEDULED-TASKS-2026-10-20-partial-create.md): retain failed drafts,
  disclose confirmed versus uncertain creation and prevent direct resubmission; producer idempotency remains open.
- [History dialog integrity](../reports/SCHEDULED-TASKS-2026-10-20-history-dialog-repair.md): reject malformed
  history instead of reporting empty/partial success, and verify native error-to-retry recovery.
- [Latest-run identity](../reports/SCHEDULED-TASKS-2026-10-20-latest-run-validation.md): sidebar and history dialog
  share record validation; foreign/malformed outcomes cannot be adopted as the selected task's result.
