# Supervision Usability v1

Status: Authorized for implementation by the user's 2026-10-18 instruction to plan, implement, test and commit the UI/UX review findings.
Related: PRD-2026-10-15-supervision-workspace; ADR-002; ADR-015.

This is an additive usability refinement. It does not rewrite the accepted supervision workspace requirements or change runtime, release, policy, or data ownership.

## Requirements

1. Cross-session permission scopes have an explicit count when summarized and an inline disclosure showing every nonempty pattern verbatim. Long individual patterns are expandable too. Approval remains once-only; deny, question answers, dismissal, risk indicators and opening the session retain their contracts. Repeated same-tick decisions dispatch at most once while pending.
2. Mission Control and Multi-run Compare share status labels and icon/dot/tone presentation: warning for approval/questions, error for failures, info for review, success for working, muted for idle. Matching sidebar states use the same colors without changing their state derivation.
3. A persistent labeled primary navigation group reaches Mission Control, the existing session workspace, and changes beside chat. Utilities remain separate. Preserve Needs You in the titlebar, notification counts, terminal and split controls, browser access, shortcuts, and unsaved-file guards.
4. Mission Control defaults to comfortable rows, offers persistent compact density, and reflows by available container width. Keep project, task title, evidence and actions readable at narrow widths. Preserve keyboard selection, peek, working sets and comparison.
5. The inspector offers persistent expandable labels for the same eight actions. Preserve focus, pressed states, change count, mobile exclusion, terminal dock and unsaved-file guards. Narrow expansion must not collapse the chat content width.

## Acceptance

- Behavioral regressions cover scope disclosure, single dispatch/retry, questions, navigation guards, inspector actions and display preference compatibility.
- Rendered fixtures exercise narrow/wide containers, long names/scopes, both densities, all six states and inspector expansion.
- Typecheck, lint, tests, build, locale and ownership/release contract checks pass for the committed candidate.
- Record reviewer recommendations and dispositions; commit only scoped changes, preserving concurrent work.

## Review process

Grok CLI, DeepSeek and GLM via AX Code provided bounded read-only plan reviews. Muse failed with subscription quota exhaustion; the user explicitly directed skipping Muse and allowed DeepSeek/GLM instead. Their feedback is advisory and must be validated in source/tests.
