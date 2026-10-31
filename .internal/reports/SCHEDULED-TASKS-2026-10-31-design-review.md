# Scheduled tasks: design and flow review

Status: review of the scheduled-task design across the AX Code runtime (`~/code/ax-code`) and AX Code Desktop, with
the bugs fixed in the two rounds of 2026-10-31 and a prioritized improvement plan. This report amends no PRD, ADR or
spec; the items marked "ADR" need one before implementation.

Related: runtime ADR-059 (scheduled task best practices) and ADR-158 (scheduled agent control); Desktop
[PRD-2026-10-20-scheduled-outcomes-v1](../prd/PRD-2026-10-20-scheduled-outcomes-v1.md) and the
`SCHEDULED-TASKS-2026-10-20-*` reports in this directory.

## 1. Scope and method

- Source read in both repositories. Runtime: `packages/ax-code/src/session/scheduled-task.ts`,
  `scheduled-task-schedule.ts`, `server/routes/scheduled-task.ts`, `project/bootstrap.ts` and the task-queue recovery
  path. Desktop: `scheduledTasksApi.ts`, `scheduledTaskTransform.ts`, `scheduledTaskFamilies.ts`,
  `scheduledTaskPending.ts`, `scheduledTaskEvents.ts`, `useScheduledTasksSync.ts`, `useScheduledTaskActions.tsx`,
  `SidebarScheduledTasks.tsx`, `ScheduledTaskEditorDialog.tsx` and the web server's
  `scheduled-task-convergence/convergence.js`.
- Two independent reviewers (muse CLI with a read-only workspace, grok CLI in a detached worktree) received the same
  brief: fifteen bug hypotheses (R1 to R9 runtime, D1 to D6 Desktop) and eight design questions. Every verdict was
  checked against source before acting on it; disagreements and the decisions taken are in section 7.
- Verification evidence is in section 8.

## 2. Current architecture

**Runtime owns** the task and run rows per project shard (`scheduled_task`, `scheduled_task_run`), the status enum
`active | paused | disabled`, next-run math (daily, weekly, cron and once, IANA zones, DST-gap skip, deterministic
jitter capped at three minutes and below the five-minute missed grace), the claim transaction with its one-open-run
overlap guard, catch-up policies with coalescing and `missed_skip`, the failure policy (exponential backoff from one
minute to one hour, auto-pause after five consecutive failures counted from run history with orphan rows excluded),
retention (fifty runs per task, finished one-time tasks deleted ninety days after their last run), the event family
`scheduled.task.{created,updated,deleted,fired,succeeded,failed,skipped,failed_persistently}`, and a per-project
scheduler started from the instance bootstrap with a sixty-second tick.

**Desktop owns** the sidebar list and editor, a per-directory display cache (`useScheduledTasksStore`), the fan-out
"families" (a multi-time or multi-weekday draft becomes N runtime tasks titled `<name> (i/N)`), the reconciliation
planner (create, update and delete per slot, `keepSchedule` for untouched slots), pending ranking, the run-history
dialog, event-driven refetch (400 ms debounce per directory, five-minute fallback), and a wake watch in the web server
that pokes the runtime so project schedulers start after a runtime restart.

**One fire today:** tick → `runDue` → claim (run row `running`, `updated` event) → queue executor → outcome
(`recordQueueOutcome`: run row terminal, task summary, failure policy, `updated` plus `succeeded` or `failed`) →
Desktop refetches the list and then one `listRuns(limit 1)` per task.

## 3. Strengths to keep

- The failure counter is derived from run history (ADR-059): restarts do not reset it, and orphaned runs do not count.
- The overlap guard runs inside the claim transaction (no check-then-act gap), deadlines are per task, and orphan
  reconciliation checks queue and workflow liveness before failing a row.
- Calendar-occurrence time semantics: a wall time that does not exist is skipped, a repeated hour fires once, jitter
  cannot be mistaken for a missed run.
- Desktop reconciliation fails closed: families split rather than merge on doubt, a definitive 4xx is reported as a
  refusal while an uncertain non-4xx locks the editor.
- Toasts and events are published detached and can never break scheduling.
- No credentials are stored in task rows, run rows or events.

## 4. Bugs fixed on 2026-10-31

### Round 1 (Desktop commit `ccbe120f`)

Finished one-time tasks were shown as paused with Resume and Run now, which the runtime rejects, and the editor could
not re-activate them; unchanged schedules were re-sent on every update (re-validated and re-armed by the runtime,
dropping failure backoff); a 4xx refusal on create locked the editor behind the "creation uncertain" notice; a paused
task's old failure counted as failing; the editor and history dialog painted the previous target for a frame; runtime
events with a real-path directory were dropped; the boot wake read the runtime identity before the runtime was ready.
Details are in that commit message.

### Round 2, runtime (commit `b84ddc2c0` in `~/code/ax-code`)

| ID  | Symptom                                                                                                        | Fix                                                                                                                                                  | Test                                                       |
| --- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| R1  | A schedule-only update of a finished one-time task stored a future `next_run_at` on a `disabled` row that `runDue` never fired and retention pruned | `update()` re-arms a `disabled` `once` task when a schedule arrives without a status; an explicit status still wins; recurring tasks a client disabled stay disabled | lifecycle: re-arm, explicit paused wins, disabled daily stays disabled |
| R2  | `disabled -> paused` without a schedule was accepted, producing a paused row with no run time and a misleading resume message | 400 `InvalidSchedule`; parking paused together with a new schedule stays legal                                                                       | lifecycle: pause of a finished one-shot rejected           |
| R3  | The resume guard said "already ran" for a paused one-shot regardless of why it was paused                       | Message keyed on the failure policy's `auto-paused` note (retry with run-now) versus a user pause past the run time (give it a new schedule)          | lifecycle: both wordings                                   |
| R4  | A run abandoned by a restart stayed `running` forever when its task was paused, or when its queue item was already terminal without an outcome | Every tick sweeps the tasks that have an open run (one query when none does), closes stale rows and publishes `scheduled.task.updated`              | lifecycle: sweep on a paused task, not stale, then stale   |
| R5  | A run-now that failed before claiming a run stamped the task error and `last_run_at` but wrote no run row, so the history was empty for a failure the row reported | `recordRunFailure` inserts a terminal `failed` row in the same write and goes through the failure policy like the claimed path                        | lifecycle: failed manual run row                            |
| R6  | `scheduled.task.deleted` carried `{id, projectID}` in its schema while the bus re-published the whole task, prompt included | Schema gains `directory`; only `{id, projectID, directory}` is published; SDK types and `openapi.json` regenerated                                    | lifecycle: deleted event payload                            |

### Round 2, Desktop (this change)

| ID  | Symptom                                                                                                   | Fix                                                                                                                                                      | Test                                                                     |
| --- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| D1  | Re-scheduling a completed task without touching the switch sent the schedule alone, which the runtime stored on a disabled row | The planner sends `active` whenever a disabled member's schedule changed, `paused` only when the switch was turned off in the same save                | families: three branches                                                 |
| D2  | A paused task's failure was invisible, and the runtime's `auto-paused after N consecutive failures` note was overwritten by the latest run's raw error, so a user pause and a failure-policy pause looked the same | `taskError` kept beside `lastError`; `pausedByFailure` on the family; the row shows the failure with the runtime's note, ranks with failing tasks and counts in the header | api, families, pending, sidebar                                          |
| D3  | A one-time task skipped by the catch-up policy rendered as "Completed" with the check icon                 | `skipped` display status for `missed_skip` (overlap skips stay idle); a finished family whose latest run was skipped reads "Missed"                       | api, sidebar                                                             |
| D4  | An empty history with a task error (the R5 shape) rendered "Couldn't load the run history"                 | Empty history reports the task's own error; a history that could not be read stays unknown                                                               | api: empty versus failed fetch                                           |
| R6  | A delete event routed only through a task-id scan of loaded groups, else waited for the five-minute fallback | The extractor reads `directory` beside the id (already on the wire from the current runtime)                                                             | events                                                                   |
| R8  | Resume was offered on a paused one-time task whose time had passed; the runtime rejected it after the fact | The action explains that run-now or a new time is needed and sends nothing                                                                               | sidebar: no request, row unchanged                                       |
| D5  | Run now on the primary part only was undocumented                                                         | Documented in the actions module: parts share prompt, agent, model and policy and differ only in slot                                                     | none (comment)                                                           |

## 5. Design gaps against best practice, prioritized

### P1

1. **State model (runtime, needs an ADR, effort M).** Three stored statuses carry at least six meanings: completed is
   `disabled` on a `once` task, expired is `disabled` with a latest `missed_skip` run, auto-paused is `paused` with an
   `error` prefix, user-paused is `paused` without it, running is an open run row in another table. R2, R3, D2 and D3
   are this one defect surfacing. Add `pausedReason: "user" | "failures"` and `disabledReason: "completed" | "missed" |
   "manual"` to `Info`, set at the four transition sites. Keep the enum (the due filter, the task cap and retention key
   on it) and store the reasons in a new table, because shard tables have no ALTER path.
2. **Events as a cache and `lastRun` on `Info` (runtime + SDK + Desktop, effort M).** Every `updated` event, which the
   runtime publishes on claim, on outcome, on workflow link and on every edit, costs Desktop a list plus one run fetch
   per task. Add `lastRun: {status, error, timeStarted, timeCompleted}` to `Info` and therefore to `updated`; Desktop
   then patches the store from `created`, `updated`, `fired`, `succeeded`, `failed` and `skipped` payloads and keeps the
   five-minute refresh as the safety net. Runtime first (SDK regeneration), Desktop keeps the N+1 fallback until the
   pinned runtime carries the field. This makes D3 and D4 free.
3. **Fan-out ownership (runtime, needs an ADR, effort L).** Title parsing is the weakest link: grouping needs the exact
   `(i/N)` suffix, a complete index set and equal shared fields, and the migration transform duplicates the rules by
   hand. Prefer a `seriesID` (new table, additive, schedules stay per task) so grouping becomes a lookup; multi-slot
   schedules (`times[]`, `days[]`) are the long-term shape if the editor model demands one status and one history per
   user-visible task. Migration: fold a recognised family on its next save; leave unrecognised parts as singletons.

### P2

4. **Scheduler activation (runtime, needs an ADR, effort M).** A project's scheduler starts only when its instance
   bootstraps, so Desktop polls the runtime identity every fifteen seconds and re-wakes every known project after a
   restart. The runtime should open every shard with an active task at its own boot and start the schedulers; the
   Desktop wake watch then shrinks to a migration step and is deleted once the boot contract is proven. Until then the
   watch is load-bearing and must not be simplified.
5. **API ergonomics (runtime + SDK, effort S to M each).** `agent` is `string | undefined` and can never be cleared,
   while `model` accepts `null`; the editor blocks the user instead. Make `agent` nullable. `once` stores only the epoch,
   so a task created in one zone shows another zone's wall time on another machine; store the originating IANA zone for
   display, the epoch stays authoritative. Create has no idempotency key; add `clientRequestID` in a side table keyed by
   project and request id, returning the existing task on replay, so an uncertain create can be retried instead of
   locking the editor.
6. **Observability (runtime, effort S to M).** There are no counters for fires, skips, coalesces, auto-pauses or orphan
   sweeps; a silently stopped schedule is discoverable only through the UI. Emit them from the functions that publish
   the events; aggregate `failed_persistently` into an alerting hook. Never put the prompt in a metric.
7. **Testing (both, effort M).** Add property tests for next-run math (random zones and times: result strictly after
   `from`, wall clock matches, exactly one local date skipped across a spring-forward gap); a Desktop reconciliation test
   against a fake runtime that implements the real status rules (400 on a past one-shot, the re-arm, mid-fan-out create
   failures); and one contract smoke test that boots the runtime and drives `/scheduled-task` once `lastRun` and
   `clientRequestID` exist. Hand-mirrored fixtures are how the D2 tooltip test came to assert a data path that did not
   exist.

### P3

8. **DST hint in the editor.** Recurring 02:30-type times silently skip the gap day; say so next to the time field.
9. **Snippet expansion** bakes expanded prompt text into the stored prompt; a snippet that carries a secret persists it
   in the task row. Warn in the editor and record the rule in the spec.
10. **Interim for uncertain creates (Desktop only).** On a non-4xx create failure, re-list and adopt parts matching the
    draft before locking the editor; lock only when adoption is ambiguous. Superseded by item 5.

## 6. Target architecture

The runtime owns a task with explicit `pausedReason` and `disabledReason`, an optional `seriesID`, a `lastRun`
summary on `Info`, idempotent create, directory-carrying delete events, boot-time scheduler start for every project
with active tasks, and fire, skip, pause and sweep counters. Clients render reasons instead of inferring them, patch
their caches from event payloads, and parse no titles. Desktop's fan-out grouping, wake watch and per-task run fetches
all delete.

## 7. Reviewer consensus and disagreements

- **Agreed by both reviewers:** R2 (narrowed to the schedule-less form), R4 residual, R5, R6, R7, R9 as a documentation
  gap, D3, D4, D6; R8 rejected (resume must not become the retry, run-now already is), D5 rejected as a defect
  (primary-only is correct because parts differ only in slot).
- **R1 scope.** muse accepted the re-arm for any disabled task; grok asked to narrow it to a one-time task so a client
  that echoes the schedule on every save cannot switch a manually disabled recurring task back on. Narrowed, with a
  test.
- **D2 header count.** muse wanted attention in the row and the header count limited to active tasks; grok wanted
  auto-paused families lifted above healthy rows. Decision: a task the runtime paused will not run again until the user
  acts, so it ranks and counts as failing; a task the user paused stays at rest even if its last run failed.
- **R4 shape.** muse proposed one sweep at scheduler start; grok showed that a row not yet stale at that moment is never
  revisited for a paused task and that the sweep published nothing. Implemented as a per-tick sweep over tasks with an
  open run, publishing `updated` when a row closes.
- **D4 transport failure.** Both reviewers: a failed fetch must not manufacture a failure state. Implemented: empty
  history reports the task error, a failed fetch stays unknown.

## 8. Verification

Runtime (`~/code/ax-code`, commit `b84ddc2c0`):

- `pnpm --dir packages/ax-code run typecheck`: pass.
- Scheduled-task suite via `AX_TEST_FILES` (9 files: routes, execution deadline, import, next-run, one-shot lifecycle,
  parallel projects, run-now overlap, session reuse, workflow outcome): 87 tests pass; the lifecycle file has 21 tests,
  5 of them new in this round.
- Task queue, remove guard, remove shard and headless runtime suites (12 files): 169 tests pass.
- `pnpm --dir packages/sdk/js run build` regenerated only the Deleted event type (`openapi.json`, `types.gen.ts`,
  `v2/gen/types.gen.ts`); SDK tests: 28 files, 282 tests pass.

Desktop (this change):

- Focused suites (`scheduledTasksApi`, `scheduledTaskEvents`, `scheduledTaskFamilies`, `scheduledTaskPending`,
  `SidebarScheduledTasks`, `useScheduledTasksSync`): 127 tests pass; `pnpm --dir desktop/packages/ui run type-check`
  passes.
- Root gates run in CI order, all passing: `check:boundaries`, `check:locales`, `typecheck`, `lint`, `test`
  (script tests 250 passed and 7 skipped; electron 383 passed and 2 skipped; web 1212 passed and 1 skipped;
  ui 5357 passed; akitty-web 1531 passed and 2 skipped).

## 9. Notes and risks

- Desktop pins runtime 7.30.1 (`config/ax-code-runtime.json`). The runtime fixes reach Desktop users only when a
  release containing `b84ddc2c0` is pinned. The Desktop changes work against both: the delete extractor reads a
  `directory` the current runtime already puts on the wire (the bus does not strip fields), and the expired one-shot
  resume is pre-empted locally.
- The Desktop planner's `paused` branch for a disabled member whose schedule changed is reachable only by a client that
  turns the switch off in the same save; the editor seeds the switch off for completed families, so it is defensive and
  matches the runtime's "explicit status wins" rule.
- `pruneFinishedOneShots` still deletes disabled one-time tasks ninety days after their last run; a re-armed task leaves
  that set because its status returns to `active`.
