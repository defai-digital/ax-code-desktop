# Supervision Usability v2 and Streamlit Project Preview

Status: Authorized for implementation by the user's 2026-10-18 instruction to work with Grok CLI and Codex CLI, plan, implement, test, and commit.

Related: PRD-2026-10-18-supervision-usability-v1; ADR-002; ADR-015.

This is an additive refinement of v1. React remains the AX Code Desktop control surface. Streamlit support means developing and previewing a user's project app, not adding a second AX Code controller, runtime, or Python SDK. Existing runtime, policy, release, profile, and source ownership remain unchanged.

## Requirements

1. Cross-session request cards explicitly label one-time permission. Sending, accepted, checking, retryable, resolved, and uncertain outcomes are visible and accessible. Conflicting or repeated decisions cannot dispatch from the card while a response is in flight or its outcome is unknown. An accepted response cannot be resubmitted from the same card. A failed response is reconciled using a read-only canonical pending-request query before enabling explicit retry; reconciliation never auto-answers, changes canonical state, or invents a new runtime endpoint. Late results must not affect a replacement request or an unmounted card.
2. Render the actual Mission Control Peek at narrow, medium, and wide widths, including 200% zoom and keyboard navigation. Fix only reproduced layout failures. Preserve scope disclosure, both densities, working sets, evidence, session navigation, and the six canonical supervision states.
3. Review copy means changes awaiting human review and never implies successful tests or approval. Keep persisted enums and preferences. Make the existing inspector-label control visibly discoverable without automatically changing an existing preference. Maintain all shipped locales.
4. Qualify a local Streamlit fixture using the ordinary Electron preview and its production webview policy, with agent access disabled. Exercise widgets, forms, streaming, upload/download, reload/reconnection, server restart, port collision, and two projects. Record shared-browser-profile behavior and external-browser fallback limits. Preserve CORS and XSRF protections.
5. After core embedded interaction passes, provide an explicit Streamlit project-action recipe with user-selected interpreter, entrypoint, and port. Reuse existing terminal ownership and Start/Stop. Never install dependencies or bundle Python as a product behavior, automatically run discovered project code, grant agent browser access, or kill a manually attached server. Closing a preview does not stop its server. Improve initial connection readiness/retry only where the spike demonstrates a need.

## Acceptance

- Behavioral regressions cover request identity, duplicate/conflicting activation, failed/ambiguous response recovery, successful response lock, canonical client/directory routing, late completion, and unmount.
- Native rendered artifacts cover real Peek, disclosure, controls, inspector labels, both densities, narrow/wide layouts, zoom, and keyboard reachability.
- Streamlit receipts distinguish successful embedded interaction from external-only fallback, and fixture qualification from full packaged cross-platform qualification. A disposable test environment is not shipped installation behavior.
- Recipe arguments are safely quoted for the explicitly selected supported shell; malicious or multiline fields cannot become extra shell commands. Unsupported shells are not silently guessed.
- Typecheck, lint, tests, build, locale, ownership/boundary, and release-contract checks pass for the candidate.
- Grok CLI and Codex CLI provide bounded plan and implementation reviews. Findings are independently checked, with dispositions recorded.
- Commit only scoped changes. Do not publish, release, or claim signed cross-platform qualification.

## Evidence

Implementation evidence: `.internal/reports/supervision-streamlit-2026-10-18/`.
Reviewer evidence: `.internal/reviews/supervision-streamlit-implementation-2026-10-18/`.
Prior advisory record: `.internal/reviews/streamlit-uiux-2026-10-18/review-disposition.json`.
