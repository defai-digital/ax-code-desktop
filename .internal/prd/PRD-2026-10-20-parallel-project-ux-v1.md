# Parallel project supervision UX v1

Status: Proposed, requested by the user on 2026-10-20 before product implementation.
Extends [parallel project outcomes](PRD-2026-10-20-parallel-project-outcomes-v1.md),
[scheduled outcomes](PRD-2026-10-20-scheduled-outcomes-v1.md) and
[WebMCP/recap](PRD-2026-10-20-webmcp-outcomes-and-recap-v1.md).
Existing accepted supervision records remain authoritative until explicitly superseded.

## Product decision

Preserve the existing supervision foundation and improve the complete multi-project journey:
start work, understand waiting, handle exceptions, return to results, and resume the right context.
Projects Home, Needs You, Mission Control, its pop-out, working sets, request cards and Compare already exist.
Another independent dashboard would add navigation and state consistency costs.

The current design has useful session supervision, but source review does not establish that it is good enough
for parallel scheduled outcomes. Actual multi-project usability and load qualification remain required.
Multiple projects, multiple occurrences of a schedule, multiple sessions, and model lanes within one task are
different objects; presenting all of them as interchangeable running rows obscures what the user supervises.

## Evidence-backed problem register

Evidence refers to the local source inspected on 2026-10-20. A confirmed representation gap is not a claim
that an execution failed. User impact marked as a hypothesis requires the specified native journey.

| ID | Problem and evidence | User impact | Proposed improvement |
| --- | --- | --- | --- |
| UX-01 | Confirmed: `lib/supervision/sessionState.ts` has permission/question/error/goal/review/running/idle; retry maps to running. No queue or waiting-reason state exists in this projection. | A six-task burst can be difficult to explain before sessions execute. Actual missing-row behavior must be reproduced. | Represent runtime-reported queued, waiting, retrying and unavailable states with reason and freshness. Keep future schedule definitions distinct from admitted runs. |
| UX-02 | Confirmed: `NeedsYouQueue.tsx` hides the project label below `sm` on non-request rows. Permission/question cards use a separate context line; Mission Control keeps project identity in its narrow layout. | Two identically named failures in different projects are ambiguous in the affected narrow rows. | Keep project identity visible at every supported width and disambiguate duplicate project labels with a compact path/worktree detail. Use identity in accessible action names as well as visible text. |
| UX-03 | Confirmed: `lib/supervision/rows.ts` models root-session rows, without scheduled occurrence or execution-host fields. `useSupervisionRows.ts` supplies diff-count evidence, not a run outcome receipt. | Users cannot reliably infer which schedule occurrence produced which session or result from this projection alone. | Join canonical project/task/run/occurrence/session identities when supplied by the producer; expose provenance and unavailable links. Preserve structured multi-run metadata and its existing legacy fallback. |
| UX-04 | Confirmed: `summarizeWorkInProgress` counts running root rows as high-touch and warns above four. This is not a measured attention threshold or execution capacity limit. | Autonomous runs and model lanes may inflate the warning; grouping could alternatively hide a blocked child. Both impacts need usability tests. | Separate active execution counts from actionable decisions. Group non-blocking work by project/task; bubble blocked child requests into the shared exception view. Retain a path to every lane. |
| UX-05 | Confirmed: Needs You preserves input order within urgency tiers (`needsYou.ts`), while Mission Control ranks by urgency and time (`sessionState.ts`). Several entry points already share `RequestActionCard` and its decision store. | Different order may make the same backlog harder to follow. Context loss and duplicate handling are hypotheses, not established defects. | Share explicit ranking semantics and identity across entry points; preserve selection, filters, scroll and return navigation. Do not introduce a competing approval store. |
| UX-06 | Confirmed: schedule row actions pause/enable the definition, while Mission Control's primary actions navigate/review. A complete run-stop flow elsewhere has not been ruled out. | Users may mistake pausing future occurrences for stopping a currently executing run. | Label **Pause schedule** and **Cancel this run** distinctly, show their scope and acknowledge actual producer state. Link to existing scoped controls before adding new ones. |
| UX-07 | Confirmed: no `lastRecap` or `session.recap` consumption was found under Desktop UI source in this inspection; supervision evidence is diff-derived. Runtime and installed SDK already expose recap-related data. | Returning users must reconstruct results from sessions; changed-file counts cannot prove task success or ownership of shared-directory changes. | Consume eligible runtime recap with freshness and evidence links. Show completed/failed/cancelled/unavailable outcomes separately from verification. Label shared-directory changes as shared context unless producer attribution exists. |

## Information architecture

- **Projects Home:** portfolio entry, concise per-project outcomes and a bounded exception queue.
- **Mission Control:** the existing live/recent supervision surface, including its pop-out. Offer project/task
  grouping for execution, and a global urgency view for decisions. Counts state their scope: projects, runs or requests.
- **Session workspace:** detailed conversation, evidence and scoped controls. Preserve unsent drafts and navigation
  context when a user temporarily opens another project's result.
- **Scheduled sidebar:** schedule definitions, enabled state and next occurrence; admitted work links into the same
  execution and outcome views. It does not become a second run-history owner.

Use progressive disclosure: compact rows retain project, task, state and immediate reason; the inspector expands
occurrence, session/worktree, host, evidence, permissions and recap. Avoid filling every row with raw IDs.
Keep a stable target while requests arrive; live updates must not move a different action underneath a focused control.
A bounded list must disclose hidden exception counts and offer access to the remainder.

### Review decisions

Keep multiple actionable projections over the existing canonical decision identity and receipt store.
Require consistent pending/resolved/uncertain state everywhere; do not force users through one screen to answer.
Preserve independent pop-out and main-window selection. Selecting or resolving a request must not silently redirect
the main workspace; an explicit Open/Reveal action may use the existing main-window handoff and retain return context.
Do not add automatic selection synchronization or a new window navigation preference without a demonstrated need.

Global blocking decisions retain priority across project filters. Project grouping organizes non-blocking execution;
errors and reviewable results remain discoverable in the exception/outcome views. Waiting age and hidden-item counts
help assess attention distribution, but starvation is a test question, not an already measured failure.

## Acceptance journeys

1. **Six simultaneous occurrences across three projects:** identify every admitted run and its project; explain
   queued/waiting states from producer data; do not infer progress from an animation. A run without a session still
   remains discoverable. Future not-yet-due definitions are not counted as active work.
2. **Same-name tasks and projects:** two failures with the same task title remain distinguishable at 360, 800 and
   1280 CSS pixels, with long labels, keyboard navigation and 200% zoom. The focused action identifies its project/run.
   Test light/dark themes and pop-out container sizes, not only full-window breakpoints.
3. **Noisy project:** fifteen pending decisions across five projects show accurate totals and a bounded list.
   A quieter project's oldest blocker is discoverable without opening every session. Grouping cannot hide blockers.
   Target: find the requested project's oldest pending decision within two navigation actions; record actual usability.
4. **Temporary context switch:** while composing in project C, inspect project A from the pop-out and return.
   Restore C's exact draft, session, scroll position and selection. Resolve A's request once; all views converge on the
   same receipt without redirecting focus or clearing another project's request.
5. **Pause versus cancel:** pause a schedule during a run and state that the current run continues; cancel one run
   and prove another project's run and pending approval remain unaffected. Show pending/failed/uncertain acknowledgement
   truthfully. Never present a click acknowledgement as completed cancellation.
6. **Return after completion:** success, failed verification, cancellation and unavailable recap produce distinct
   outcomes linked to their correct project/run. The existing persisted recap is readable without a fresh model call.
   Shared worktree diffs do not claim exclusive run attribution.
7. **Model lanes:** renamed metadata-backed lanes stay grouped. Show the blocked lane's decision even when its task
   is collapsed. Display both execution and decision counts without claiming a tested capacity from the old soft limit.
8. **Updates under load:** preserve keyboard target, selection and scroll while new events arrive; no per-token
   toast flood or full-list history reload. Use the parallel-outcomes PRD's six-task latency gate and twenty-task
   characterization, including independent API/event receipts.

The widths above are test viewports, not a new native minimum-window-size promise. Distinguish component/container
rendering checks from native supported-window qualification. Human comprehension targets need observed usability
sessions; automated tests alone cannot prove scanability.

## Priorities and scope

P0: trustworthy state/identity, waiting reasons, scoped pause/cancel, stable decisions and context preservation.
P1: return-to-work recap, result navigation, shared-change attribution and grouping/count clarity.
P2: measured visual density and notification refinements after the first two groups pass.

Use existing SDK/runtime capabilities first. Producer contract gaps belong in AX Code, generated SDK and applicable
MCP/WebMCP contracts; the user authorized paired changes. New locked behavior requires the applicable ADR/spec records.
No automatic approvals, higher budgets, hidden recurring activation, runtime duplication or unqualified release.

## Verification and advisory review

Native WebMCP must exercise the user journeys; verify state independently through DOM, screenshots and runtime receipts.
Review populated multiple-project screens in light/dark and narrow/wide layouts. The old Settings screenshots and a
main-window capture named after a pop-out journey do not qualify this design.

Grok, Muse and Claude CLI completed bounded read-only source reviews and a corrected-evidence discussion.
Their outputs and independent claim validation are in the
[review record](../reviews/parallel-project-ux-2026-10-20/README.md). Reviewer recommendations are design
input, not measured user research or proof of runtime/visual correctness.
