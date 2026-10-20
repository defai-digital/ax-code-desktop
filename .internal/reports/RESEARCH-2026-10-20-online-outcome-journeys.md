# Online research: useful coding outcomes and repeatable application checks

Date: 2026-10-20. Research baseline: Desktop `855c3032`.
Scope: official online documentation, supplementing the
[pinned local-reference comparison](DESIGN-2026-10-20-reference-comparison.md).
No reference checkout was updated and no competitor application was executed in this follow-up.
Documentation describes intended behavior; it does not qualify reliability, capacity or AX implementation.

## Findings and design implications

| Source inspected on 2026-10-20 | Documented behavior | AX design implication, not a competitor benchmark |
| --- | --- | --- |
| [Chrome WebMCP overview](https://developer.chrome.com/docs/ai/webmcp) | Structured JavaScript tools and annotated forms; origin trial and local flag; API remains subject to change. Human-involved local browsing is the primary design context. | Qualify each pinned browser/build and execution mode. Having web technology underneath Desktop does not establish WebMCP capability. |
| [Chrome best practices](https://developer.chrome.com/docs/ai/webmcp/best-practices) | Clear action semantics, useful registration lifecycle, code-side validation, meaningful failures and visible state updates. | Distinguish opening an editor from saving. After a call, observe its effect before advancing; a new page can invalidate available actions. |
| [Chrome tool security](https://developer.chrome.com/docs/ai/webmcp/secure-tools) | Tool exposure has origin boundaries; read-only results can disclose data. Current examples use `document.modelContext`. | Inspect the exact engine's API rather than choosing a global name from an older example. Existing authority and project boundaries apply to reads and writes. |
| [OpenChamber Sessions in Work](https://docs.openchamber.dev/sessions-in-work/) | Recap follows idle time; a suggested message fills the composer without sending. Marking work done is a separate user action. Scheduled runs are excluded from this collection. | Offer saved context immediately on return and keep resume explicit. Scheduled failures/results still need a discoverable AX portfolio surface. |
| [OpenChamber Scheduled Tasks](https://docs.openchamber.dev/scheduled-tasks/) | Run now, session links and errors; repository loop activation requires local enablement and renewed enablement after relevant changes. Tasks depend on a running server. | Separate a shared definition from authorization to activate it. Explain execution availability and provide a result link. This does not propose importing its loop file format. |
| [Orca Scheduled automations](https://www.onorca.dev/docs/cli/automations) | Explicit target, IANA zone, precheck/skipped run, missed-run grace, fresh/reused session and run history. The guide starts with disabled creation and manual inspection. | Cover overlap, restart and manual runs explicitly. These controls describe useful design questions; the page does not prove concurrent-run isolation or exactly-once execution. |
| [Herdr restoration matrix](https://herdr.dev/docs/session-state/) | Detach can retain processes; server restart restores layout without retaining original processes. Conversation restoration has separate prerequisites. | Present close, disconnect, restart and resume as different operations with separately tested effects. |
| [OpenCode Web](https://opencode.ai/docs/web/) | Web and attached terminal clients can share one server's sessions and state. | Keep Desktop as a client of canonical execution facts; test state consistency across views instead of adding a second runtime. |

## Positioning hypothesis

A useful AI coder reduces the effort needed to reach and trust a working result. For AX, the proposed differentiator is
a short, inspectable loop: define expected behavior, exercise the application, diagnose a failure, repair it, repeat the
check, and return to the evidence later. WebMCP supplies structured interaction; the runtime supplies coding and
verification; Desktop keeps projects, decisions and return context understandable. This is a product hypothesis, not
evidence of exclusivity or measured superiority.

Three concrete journeys make the hypothesis testable:

1. A user reports that a setting does not persist. Reproduce through native WebMCP, observe saved state after reload,
   repair the cause and repeat the same check. Inspect keyboard access and screenshots as additional checks.
2. Six scheduled checks become due across three projects. See each occurrence, identify the blocked/failed checks,
   inspect the correct result and stop one run without affecting unrelated work. Include a second due time while an
   earlier run is active; establish the producer's actual overlap policy rather than assuming parallel execution.
3. A user returns with the provider unavailable. Read an existing recap, identify its project, time and limits, open
   available evidence and resume the intended session. Reading saved context must not require generating new content.

## Evaluation and evidence limits

Compare the same scoped journey against the current AX baseline. Record correct destination, independent acceptance,
human intervention/review time, provider cost, failure recovery and reopened defects. A semantic tool's own success
response cannot be its only oracle. Check a separately observable effect, such as persisted state, canonical producer
read-back or a domain assertion. Record how independent that observation is; a second call into the same faulty code
does not automatically provide independent verification.

Keep semantic checks, rendered UI checks and visual/keyboard checks distinct. Deliberately include a persisted-state
failure, a stale result and a focus/layout problem. Replay intent with fresh target resolution rather than storing DOM
references. Retain build/profile/backend identity and bounded evidence without raw credentials.

No measured productivity, token savings, supported task capacity, production WebMCP compatibility or cross-provider/MCP
isolation is established by these pages. Earlier bounded advisory reviews remain associated with their original
evidence records; they do not qualify this follow-up. The new acceptance work is specified in the
[PRD addendum](../prd/PRD-2026-10-20-online-outcome-journeys-v1.md) and
[plan](../plans/PLAN-2026-10-20-online-outcome-journeys-v1.md).
