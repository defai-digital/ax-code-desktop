# Reference-informed supervision plan

Status: Proposed implementation sequence. Research and documentation are authorized; this plan does not authorize a new
runtime boundary or supersede accepted records.

Inputs: [PRD](../prd/PRD-2026-10-20-reference-informed-supervision-v1.md),
[comparison](../reports/DESIGN-2026-10-20-reference-comparison.md),
[parallel-project plan](PLAN-2026-10-20-parallel-project-outcomes-v1.md),
[parallel-project UX PRD](../prd/PRD-2026-10-20-parallel-project-ux-v1.md) and existing WebMCP/recap plan.

## Completed research checkpoint

- Inspected all four local references at recorded commits, including source, selected tests and repository screenshots.
- Read current official online docs and compared remote tips without updating reference checkouts.
- Verified AX's present recap SDK shape, startup-timezone implementation and selected supervision gaps.
- Completed Muse's advisory review and independently dispositioned its findings; Grok produced no substantive review
  after a turn-limit failure and one bounded timeout. See the [review record](../reviews/reference-design-2026-10-20/README.md).
- Completed the pre-existing permission-pattern repair independently: commit `ac6310b3`, 13 mounted tests,
  UI typecheck, lint, build and native WebMCP regression passed. No configuration save was submitted by that native test.

## Sequencing

| Step | Deliverable | Owner and gate |
| --- | --- | --- |
| A | Map requirements RS-01 to RS-12 to existing source and acceptance journeys. Reproduce specific identity, waiting, selection and notification defects. | Desktop; extend the existing isolated native harness, retain negative and post-repair evidence. |
| B | Define saved-recap presentation, freshness limits, explicit refresh, late-response isolation and empty/error behavior. | Desktop plus AX Code contract review; inspect runtime ADR-082/095/096/148 and write the required spec before product implementation. No new producer is assumed necessary for read-only display. |
| C | Implement the smallest complete return-to-session journey over the pinned public SDK. | Desktop, after applicable records. Mounted tests plus native offline-return, stale recap, project-switch and screenshot checks. |
| D | Qualify schedule occurrence visibility, queue reasons and pause/cancel behavior across three projects. | AX Code supplies missing canonical facts; Desktop consumes. Paired ADR/spec work precedes new contracts; exact SDK/runtime adoption remains separate from local source changes. |
| E | Join independently checked WebMCP application outcomes into review/recap. | Runtime owns evidence and verification; Desktop owns bounded presentation. Demonstrate one broken application workflow, repair, retest and evidence navigation end to end. |
| F | Qualify multi-window interruption behavior, restoration semantics and populated narrow/light/dark layouts. | Desktop with canonical lifecycle owners. Record unsupported cases, not optimistic success. |
| G | Run the small comprehension pilot and compare against the current AX baseline. | Product validation. Use measured orientation/review effort to refine density, defaults and placement. |

Prioritize A/B, then C/D. Do not hold a basic readable recap hostage to a richer evidence system; also do not relabel that
basic recap as a verified outcome. Existing scoped bug repairs can continue under their existing authorization.

## Required evidence

- Canonical IDs for project, run/occurrence and session; producer state, event time and freshness where available.
- Native WebMCP action receipts plus fresh DOM/assertions and screenshots. Stored DOM references are not replay targets.
- Independent expected/observed runtime facts for concurrency, failure and cancellation.
- Isolated fixtures for permissions, unavailable history/provider, late responses and duplicate names.
- Qualified live-provider/MCP results separately labeled from stub and mocked-prompt results.
- Lifecycle matrix distinguishing a closed view, detached client, stopped runtime and machine restart.
- Focused meaningful regressions, UI typecheck and applicable full-suite/boundary checks; scoped local commits.

No publishing, release, budget increase or permission expansion is implied. Preserve all unrelated changes and reference
checkouts. Record source versions and evidence limitations in every comparative follow-up.
