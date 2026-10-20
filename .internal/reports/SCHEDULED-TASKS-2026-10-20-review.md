# Scheduled-task value and implementation review

Status: Initial source/contract review and existing regressions, following the user's 2026-10-20 request.
No scheduled-task implementation was changed, no real task was created/activated and no live-model firing was tested.
Related: [PRD](../prd/PRD-2026-10-20-scheduled-outcomes-v1.md) and
[plan](../plans/PLAN-2026-10-20-scheduled-outcomes-v1.md).

## What already exists

The editor, sidebar and actions support task creation/editing, multi-time/weekday families, pause/resume, Run now,
delete confirmation and history. Tasks/history are runtime-owned; the Desktop store is a per-directory display cache.
The store guards stale loads and removed projects. Synchronization uses runtime events, due-time checks and fallback
refresh, not a second scheduler. History has error/retry, duration, manual/scheduled trigger and skipped/failure outcomes.
These are useful foundations and should not be described as an absent feature.

Reviewed: `scheduledTasksApi.ts`, `scheduledTaskTransform.ts`, `useScheduledTasksStore.ts`,
`ScheduledTaskEditorDialog.tsx`, `SidebarScheduledTasks.tsx`, `useScheduledTaskActions.tsx`,
`useScheduledTasksSync.ts`, `ScheduledTaskRunHistoryDialog.tsx`, `scheduledTaskRunHistory.ts` and focused tests.
Inspected installed exact SDK **2.6.37** generated `ScheduledTaskCreateData`, `ScheduledTaskListRunsResponses` and
`ScheduledTaskRunNowResponses`. No producer source or pin was changed.

## Findings, ordered by user impact

### 1. Outcome fallback can report success without outcome evidence

Confirmed implementation and test behavior: `toScheduledTask` sets `lastRunStatus: "success"` when `lastRunAt` exists
and no task-level error exists. `withLatestRun` keeps that value when history rejects, returns no run or an SDK error
without data. Existing `scheduledTasksApi.test.ts` explicitly expects success when history throws.

A timestamp proves an attempted/recorded run, not its successful outcome. The sidebar often labels an active row
Scheduled rather than showing a success badge, so this review does not claim to have reproduced a green badge there.
The display model still contains a false success and can feed family projections. Keep the row usable but distinguish
unknown history from success, and distinguish scheduler completion from independently verified user outcomes.

### 2. Failed multi-slot creation has an unsafe retry path

Confirmed source path, not yet native fault-injection reproduction: `createScheduledTasks` creates members sequentially.
If member 1 succeeds and member 2 fails, member 1 remains. `handleSave` reloads the group and rethrows. The editor remains
in the new-task branch on retry, which creates all payloads again. Its source comment explicitly documents duplication.

Priority: high before encouraging repeated unattended tasks. Reproduce a three-slot create with an injected second-slot
failure, then retry and inspect identities/counts. Fix needs operation identity or safe reconciliation; same-title matching
alone is insufficient and can adopt an unrelated user's task.

### 3. Paused creation is a create-then-pause sequence

Contract risk: UI `enabled=false` calls runtime create (active), then pause. SDK `ScheduledTaskCreateData` has no initial
status field. A pause failure leaves an active task, as the existing error message acknowledges. A due task could become
runnable before pause; that timing race is not reproduced by this review. Paused creation must not be promised atomic
without producer support. Do not solve it by duplicating scheduling/leases in Desktop.

### 4. Result navigation drops producer-provided identities

Confirmed display/contract gap: SDK list-runs already provides optional `queueID` and `workflowRunID`; the local
`ScheduledTaskRun` and `toScheduledTaskRun` omit them. Run-now returns a queue item (with optional `sessionID`) or workflow
run, but `runScheduledTaskNow` returns void and drops that response. The history dialog renders status/time/error without
an output/session navigation action.

This is a direct user-value opportunity: open the actual work, inspect evidence, then resume or review it. Preserve
existing optional links first and qualify their resolution before asking for a new endpoint or claiming a missing SDK
contract. Some older runs may have no link; show that explicitly. A full recap/evidence producer contract can follow.

### 5. Recurring timezone menu bypasses the existing safe option helper

Confirmed source mismatch: the once editor renders `timezoneOptions` from `buildTimezoneOptions(selected)`, including
UTC and the selected zone. The recurring daily/weekly editor renders bare `TIMEZONE_OPTIONS`. On the current Node 26
host, `Intl.supportedValuesOf("timeZone").includes("UTC")` is false. Thus its options omit UTC and can omit a valid
selected alias. Existing helper tests pass without exercising that recurring menu. Native menu selection and no-change
round-trip reproduction are planned before classifying the exact visible failure.

### 6. Current native fixture does not qualify scheduling

The E2E stub lists `/scheduled-task` as an empty list route; the existing Settings journeys do not create/fire/recover
scheduled tasks. Unit tests are useful but do not prove the runtime remains available through app closure, machine sleep,
restart, timezone transitions or missed occurrences. Do not imply cloud/always-on scheduling from this local UI.

## Product priority

Prioritize trustworthy recurring outcomes: schedule → perform a bounded WebMCP/repository check → independently observe
results → preserve failure/evidence → show a useful recap → let the user handle exceptions. First proposed templates:
project morning brief, repeated app smoke check and repository health review. Activation remains explicit; existing
runtime permissions, model selection, cancellation and budgets govern execution.

[Cursor Automations](https://cursor.com/docs/cloud-agent/automations) documents scheduled/event-triggered agents and
MCP-enabled work. [Claude Code scheduling](https://code.claude.com/docs/en/scheduled-tasks) explicitly compares cloud,
Desktop and session execution. These are reference capabilities inspected on 2026-10-20, not proof of AX Code demand,
measured productivity or permission to expand scope into a cloud scheduler.

## Validation

Focused existing tests: **7 files / 81 passed** in `/tmp/ax-desktop-scheduled-task-review-tests-20261020.log`:
API, transform, store, timezone helper, history dialog, family reconciliation and irregular-schedule actions.
The previously completed full UI suite also passed 3,703 tests. These tests currently include the success-on-history-error
expectation, so their green result does not resolve finding 1. No native scheduled-task journey or live firing is claimed.

Next: implement the stateful native fixture and failing regressions listed in the plan, then repair confirmed existing
paths within accepted ownership. New producer guarantees require the repository's paired ADR/spec process.
