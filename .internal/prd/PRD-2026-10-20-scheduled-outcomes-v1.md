# Scheduled outcomes v1

Status: Proposed addendum requested by the user on 2026-10-20, before scheduled-task product implementation.
Related: [WebMCP and recap PRD](PRD-2026-10-20-webmcp-outcomes-and-recap-v1.md),
[review](../reports/SCHEDULED-TASKS-2026-10-20-review.md),
[implementation plan](../plans/PLAN-2026-10-20-scheduled-outcomes-v1.md).
This proposal adds a scheduling priority; it does not silently supersede an accepted record or authorize new recurring spend.

## Product hypothesis

AX Code should turn recurring development intentions into inspectable results: schedule a useful check, exercise the app
through WebMCP where supported, retain evidence, and present a recap plus the next decision when the user returns.
Scheduling is a core product journey alongside interactive coding and project supervision.

The value is time saved on repeated checks and quicker action on exceptions. Job volume, prompt count and a green
scheduler status are insufficient success measures. The user should understand what ran, where, why, what was verified,
what needs attention and how to stop or change it.

## Initial useful journeys

| Proposed workflow | Expected deliverable | Initial scope |
| --- | --- | --- |
| Project morning brief | Changes since the prior checkpoint, verified results, blockers and next actions with links | User-selected projects and cadence; evidence first |
| Repeated WebMCP smoke check | Bounded app workflow, independent checks, screenshot/repro on failure | Fixture or authorized app context; unavailable browser/auth is blocked, not success |
| Repository health review | New test/build failures or code risks and a reviewable proposed repair | Report or draft changes; no automatic merge/release |
| Follow-up check | A later observation of an explicitly selected long-running task | Bound stop condition and existing runtime policy |

Templates are proposed, editable starting points. Preview scope, schedule, execution host, permissions and expected output
before activation. A template cannot confer new permissions, guarantee a browser is available or hide ongoing cost.

## P0: Trustworthy existing scheduling

- Create/edit/cancel, pause/resume, Run now, history/retry and deletion must preserve the correct project/task family.
- Display actual next occurrence and timezone. Verify daily/weekly/once, DST gaps/folds, restart, missed occurrences and
  overlap. State whether the runtime must be running and whether the machine must be awake; do not promise cloud execution.
- Distinguish task configuration, scheduler execution and verified task outcome. Missing history is unknown/unavailable;
  a previous timestamp is not proof of success. Scheduler completion can be shown as such without claiming app acceptance.
- A partial multi-slot create must expose created members and a safe next action. Retrying cannot silently recreate every
  successful slot. Acknowledged side effects and uncertain responses require separate handling.
- Disabled creation must not silently start an active task. If atomic paused creation is absent from the producer contract,
  resolve the contract before promising it. Do not invent a Desktop scheduler or compensating retry engine.
- One-time success, skipped overlap, missed-skip, timeout, model/provider failure and approval-needed remain distinguishable.
- Run history must lead to the available session/output/evidence, or explain that the published contract lacks that link.

## P1: Scheduled results and recap

A scheduled result has project/task/run identity, trigger/occurrence, execution host, timestamps, configuration revision,
execution status, outcome verification status, evidence links, errors and a useful next action. An available result is
readable without generating a fresh model response. Stale/partial/unavailable evidence is explicit.

The recap aggregates relevant results and unresolved exceptions, with a since-last-view checkpoint. It does not turn every
completed run into a notification. Preserve a visible inbox for failures/approval requests and concise summaries for routine
success. Notification delivery preferences and result acknowledgement are separate from runtime execution state.

Use the existing runtime's model, tool, permission, cancellation and budget controls. Desktop may show bounded projections;
canonical tasks, scheduling, deduplication, leases, history and receipts remain producer-owned. No new policy or spending
limit is introduced by this proposal. Host-independent execution is future contract work, not a current Desktop claim.

## Acceptance and priorities

1. Prove the existing lifecycle and failure matrix before increasing cadence or adding templates.
2. Ship one narrow outcome journey: user-selected fixture WebMCP smoke check → evidence → visible result → recap/resume.
3. Add reusable templates and broader projects only after the result and recovery loop is reliable.

Proposed measures: accepted actionable results per human review minute, false-success rate, duplicate/unintended runs,
time from failure to useful action, missed/late occurrences, cost per accepted result and notification noise. Establish
baselines before targets; these are not current telemetry or a measured benefit.

## Reference research

[Cursor Automations](https://cursor.com/docs/cloud-agent/automations) documents scheduled/event-triggered cloud agents,
MCP tools and code-change summaries. This supports examining recurring outcomes; it does not prove AX Code user value or
justify copying cloud ownership. [Claude Code scheduling](https://code.claude.com/docs/en/scheduled-tasks) distinguishes
cloud, Desktop and session-scoped execution, including host availability and persistence. AX Code must make its own
execution contract equally explicit. Both sources were inspected on 2026-10-20.
