# Online-informed outcome journeys v1

Status: Proposed addendum, 2026-10-20. Research and planning precede implementation.
Extends [reference-informed supervision](PRD-2026-10-20-reference-informed-supervision-v1.md),
[scheduled outcomes](PRD-2026-10-20-scheduled-outcomes-v1.md) and the existing WebMCP/recap proposal.
It does not supersede accepted PRDs, ADRs or specifications.

Evidence: [official-source research](../reports/RESEARCH-2026-10-20-online-outcome-journeys.md).
Execution: [plan](../plans/PLAN-2026-10-20-online-outcome-journeys-v1.md).

## User value

Help users obtain working changes, understand unattended results and resume the correct work with less supervision.
WebMCP is the structured application-interaction mechanism within that journey. Evaluate accepted results and human
effort before claiming an advantage from tool count, model count or concurrent task count.

## Additional acceptance requirements

| ID | Priority | Requirement and observable acceptance |
| --- | --- | --- |
| OJ-01 | P0 | Keep a build-specific WebMCP capability record: engine/API shape, flag, adapter, execution mode and supported surface. Test native discovery and invocation on the actual target. Unpackaged Desktop development tools and packaged project-browser tools have separate qualification. Unsupported capability is explicit. |
| OJ-02 | P0 | Distinguish initiating a workflow from its committed effect. A passing journey observes the expected result after asynchronous completion and, where relevant, reload. Include a negative control that acknowledges a call but fails to persist; the evaluator must reject it. |
| OJ-03 | P0 | Reconcile uncertain writes before offering another submission. A transport timeout after a possible save or task start must not become an automatic retry that duplicates effects. Where the producer cannot reconcile, display uncertainty and retain the user's draft. |
| OJ-04 | P0 | Qualify the same task becoming due while its previous occurrence is active, Run now during an active occurrence, pause during execution and cancel during admission. Report the producer's actual queued/skipped/overlap behavior with occurrence identity. Desktop cannot invent a scheduling policy. |
| OJ-05 | P0 | Qualify sleep/wake, runtime restart, missed occurrences and DST repeated hours against the canonical scheduler. Document actual skip/catch-up behavior and show uncertainty when facts are absent. Existing startup-cached timezone defaults, saved zones and explicit overrides remain as specified by RS-08. |
| OJ-06 | P1 | Read a saved recap without a provider call, retain project/session/time/scope, and expose stale or unavailable evidence. Suggested follow-up text enters the correct draft without sending it. Navigation and late responses cannot overwrite another project's draft or recap. |
| OJ-07 | P1 | If shared schedule definitions become a product surface, importing or refreshing them cannot itself authorize recurring execution. Relevant definition changes must follow a specified activation policy. This requirement does not add file import, a new policy engine or automatic reactivation. |
| OJ-08 | P1 | Pair a semantic outcome check with keyboard and visual checks on populated content. Cover focus exit, disabled actions, duplicate project names, error text, narrow layouts and light/dark themes. A successful tool call cannot qualify presentation. |

OJ-04/05 extend RS-07/12. Missing producer fields or recovery semantics require paired AX Code contract work before
the affected requirement can be qualified. They are not new Desktop execution responsibilities. AX Agent durability,
AX Trust authority and current budgets remain unchanged.

## Initial deliverable and limits

Start with the existing Settings persistence journey and the smallest saved-recap return journey. Then qualify six
simultaneous scheduled tasks across three projects with deterministic failure injection, followed by a separately
scoped live provider/MCP check under existing permissions and budgets. Do not call fixture dispatch a live capacity test.

For each journey retain expected/observed behavior, the observation's independence, app/runtime/SDK identities and
execution backend. Measure human correction/review time, accepted results, provider cost and wrong-context actions.
Establish the baseline before selecting numerical benefit targets. No automatic release, permission expansion, new
recurring spend or competitor-performance claim is implied.
