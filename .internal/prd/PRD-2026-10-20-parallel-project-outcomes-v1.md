# Parallel project outcomes v1

Status: Proposed requirements and qualification addendum, requested on 2026-10-20.
Related: [Scheduled outcomes](PRD-2026-10-20-scheduled-outcomes-v1.md),
[WebMCP and recap](PRD-2026-10-20-webmcp-outcomes-and-recap-v1.md),
[delivery plan](../plans/PLAN-2026-10-20-parallel-project-outcomes-v1.md).

The user explicitly authorized coordinated changes in `../ax-code`, including SDK and MCP work.
This expands implementation scope; it does not approve a release, new spending, broader tool permissions,
or a transfer of runtime ownership. Existing accepted records remain unchanged.

## User outcome

A user can leave several projects doing useful work, continue interactive work in another project,
and return to an accurate recap of results and exceptions. The user can identify what is running,
what is waiting and why, what needs a decision, and which task can be safely stopped.
Opening multiple projects is not sufficient evidence of good parallel execution.

## Current evidence and unknowns

Source inspection of AX Code at `44acb93c6` found project-qualified session/task start locks,
atomic execution claims, waiting-for-idle handling and workflow phase admission/pacing in
`packages/ax-code/src/session/task-queue-executor-impl.ts`. These are existing building blocks,
not proof that the pinned released runtime or Desktop passes the scenarios below.

AX Code's documented recap contract includes `session.recap` and bounded persisted `lastRecap`;
the installed Desktop SDK also declares `lastRecap`. Check the actual producer implementation,
SDK method and Desktop consumer before proposing a replacement. Durable session previews and
a portfolio-wide outcome recap are different capabilities.

No multi-project runtime stress qualification is claimed by this document.

## P0 requirements

1. **Honest execution state.** Show project, task, run, session/worktree and execution host where supplied.
   Distinguish queued, waiting, running, approval/question blocked, completed, failed and cancelled.
   Display the available reason for waiting. Unknown or disconnected is not success.
2. **Isolation.** Events, logs, artifacts, recap and controls remain attached to their originating project/run
   through rapid project switches, window changes, removal, reconnect and delayed responses.
   Cancelling one run must not cancel another project's work or dismiss its approval.
3. **Safe concurrency.** Respect runtime session, worktree, overlap and workflow limits. Independent projects
   should make progress when existing capacity permits; same-session conflicts must wait explicitly.
   Surface resource/provider limits without silently raising concurrency, permissions or budgets.
   Test shared-repository worktrees as well as independent repositories.
4. **Responsive supervision.** Switching projects, inspecting results and cancelling work remain usable
   while multiple streams and scheduled-task updates arrive. Bound subscriptions, polling and history fan-out;
   do not refetch every run on every token. Queued work must not starve silently behind one busy project.
5. **Reliable scheduled bursts.** Simultaneous due tasks and Run now requests must have unambiguous admission
   and overlap behavior. Reconnect/retry/restart must not duplicate execution. Distinguish pausing future
   occurrences from cancelling the current run.
6. **Scoped MCP and WebMCP.** Keep connection, browser/page, origin, tool discovery, approvals, cancellation
   and results bound to the originating execution. Two projects using similarly named tools must not share
   the wrong context. A blocked or disconnected server must not freeze unrelated project controls.
   Preserve existing runtime permission rules and uncertain-completion behavior.
7. **Useful recap.** Reuse eligible runtime recap data. Show per-project results and unresolved exceptions
   with evidence and resume links; preserve freshness and unavailable states. Execution completion alone
   cannot claim the application passed verification.

## Qualification matrix

| Scenario | Required evidence |
| --- | --- |
| Two independent projects, one interactive run each | Overlapping actual execution intervals; correct streams, outputs and controls |
| Three projects, two scheduled tasks each due together | Six distinct occurrence/run identities; queue/admission reasons; no lost or duplicate execution |
| One busy session plus scheduled work in that project and another | Same-session exclusion; unrelated work progresses when eligible |
| Interactive work during a scheduled burst | Switching, editing and scoped cancellation remain responsive |
| One approval wait, one failure, one cancellation and one success | Independent state transitions, notifications and correctly attributed results |
| Two projects using MCP/WebMCP concurrently | Distinct project/session/page receipts; no cross-project invocation or approval |
| Shared repository with separate worktrees | Correct working directories and artifacts; no conflicting implicit checkout |
| Reconnect/restart, late events and removed project | Convergent state, no resurrection or duplicate execution, explicit unavailable host |
| Ten projects with two tasks each | Controlled load characterization; latency, request counts and memory observations |

Use deterministic local providers and temporary repositories for runtime integration tests. Native WebMCP exercises
Desktop controls; independent runtime receipts and DOM/screenshots verify the result. Fixture-only UI evidence,
real runtime integration, packaged runtime compatibility and host sleep/recovery are separate qualification levels.
Do not report unrun levels as passing.

Record machine/runtime/SDK versions, admission policy, run counts, queue delay, completion latency, UI action latency,
request/subscription counts and peak memory. Proposed local gate: p95 action-to-visible-feedback within one second
over at least 30 actions during the six-task burst, excluding model completion; retain raw timings. Correct attribution,
zero duplicate executions and cancellation isolation are mandatory. The twenty-task case establishes a supported
capacity baseline; it is not a promise of twenty simultaneous model requests.

## Ownership and delivery

- Desktop owns project supervision, status presentation, controls, evidence navigation and recap consumption.
- AX Code owns execution admission, queue/schedule semantics, cancellation, runtime MCP/WebMCP and canonical recap.
- The SDK exposes the producer contract through generated typed APIs. Change producer schemas first and regenerate;
  do not hand-edit generated SDK files or invent consumer-only endpoints.
- Preserve AX Agent, AX Trust and AX Telemetry boundaries. New ownership or locked-contract changes require the
  applicable accepted PRD, paired ADRs and technical spec before implementation.

Prioritize reproduced correctness failures, then missing consumer integrations, then measured responsiveness/fairness
gaps. Rank success by reliable reviewed outcomes and time saved supervising projects, not the number of active spinners.
