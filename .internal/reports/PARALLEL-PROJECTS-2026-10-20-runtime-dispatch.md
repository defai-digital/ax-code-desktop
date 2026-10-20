# Parallel scheduled dispatch qualification

Scope: source-level AX Code scheduler/queue integration, following the user's authorization to work in both
repositories and the parallel-project PRD. This advances the concurrency matrix without claiming complete
Desktop, provider, MCP or packaged-runtime qualification.

## Test construction

New producer test: `packages/ax-code/test/session/scheduled-task-parallel-projects.test.ts`.

Three temporary Git projects each create two one-time tasks due at the same nominal instant. Each project's
real `ScheduledTask.runDue` admits its tasks through the actual scheduler, claim transactions, project shard,
queue executor and session creation. A controlled `SessionPrompt.prompt` boundary holds all executions until
six distinct sessions have entered. No executor or scheduler is mocked and no test writes terminal lifecycle
states directly. The barrier would time out if execution dispatch were serialized across these six tasks.

The prompt boundary is a deterministic substitute, not a real model/provider invocation. The test explicitly
does not measure provider rate limits, tool execution, MCP cancellation or actual prompt-loop cancellation.
The simulated tick is past the scheduler's missed-run grace; `catchUpPolicy: run_once` is explicit. This tests
simultaneous catch-up admission, not on-time jitter behavior.

## Assertions

- Six executions enter before any controlled prompt completes.
- Three distinct project identities retain their own task lists, queue rows, sessions and prompt contexts.
- Pausing one schedule leaves its current queue execution running.
- Stopping a different queue execution produces cancellation without affecting the other projects' running items.
- Releasing one controlled failure and the other successes gives the expected per-queue terminal results.
- A late successful response cannot overwrite the stopped item as completed.
- Each scheduled history retains one occurrence with its correct queue and project identity.

## Evidence

Source checkout base inspected during qualification: `589dd9f0462512fe8126ab9b95f93f2556c0ee60`.
Existing unrelated TUI MCP edits were preserved and excluded from this test change.

- Initial new test: `/tmp/ax-runtime-parallel-projects.log`, 1 passed.
- Related overlap, session-reuse, queue-outcome and new concurrency suites:
  `/tmp/ax-runtime-parallel-regressions.log`, 4 files / 25 tests passed.
- AX Code typecheck: `/tmp/ax-runtime-parallel-typecheck.log`, passed.
- Final focused retest after strengthening the late-result history assertion:
  `/tmp/ax-runtime-parallel-final.log`, 1 passed.
- Producer test commit: `a188f43c129e2e1b07ef79edff7a8c09a117ea51`, local only.

## Contract gap and remaining qualification

Queue status includes `cancelled`; the scheduled history schema currently has no cancellation variant.
Do not render a stopped run as verified success or claim that cancellation is already distinct throughout the UI.
The producer history contract, generated SDK and Desktop result projection need coordinated consideration before
adding a new status. This report does not silently revise a locked schema or create a consumer-only endpoint.

Still open: on-time scheduled bursts, actual local-provider prompt-loop execution, same-session waiting under
interactive load, MCP/browser context isolation, packaged pinned-runtime compatibility, host recovery, fairness,
twenty-task capacity characterization, and populated multi-project native WebMCP UX journeys.
The six-task source integration evidence is stronger than simultaneous UI spinners but is only one qualification layer.
