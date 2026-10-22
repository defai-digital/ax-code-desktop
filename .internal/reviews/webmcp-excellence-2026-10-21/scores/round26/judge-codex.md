**Round 26 at `96f74a34`: A = 8.13/10; B = 8.00/10.**

Reviewed round-26 HEAD; `92775899` is an ancestor. Verified `15f40f1d..HEAD` and v7.28.2’s approval payload. Credit includes observed, retained `definitionDigest` and redacted `inputPreview`; no unsent runtime fields receive credit. Read-only: no files modified; **20 redaction tests passed**; native journeys and screenshots were not verified.

Paths: `UI` = `desktop/packages/ui/src`; `E` = `desktop/packages/electron/src`.

| Step | Score | Judgment and source |
|---|---:|---|
| A1 discover | 8 | Descriptions, schemas, hints, origin and catalog limits support discovery, but capability inspection remains behind nested technical disclosures (`UI/components/mcp/WebMcpToolPanel.tsx:964`). |
| A2 enable and scope trust | 9 | Project/session ownership, explicit access scope, independent revocation and project sign-out make trust understandable and controllable (`UI/components/mcp/WebMcpPages.tsx:162`; `UI/components/layout/EmbeddedWebMcpBrowser.tsx:475`). |
| A3 watch live | 8 | The call strip exposes arguments, duration, results, approval navigation and failure summaries, although displayed evidence remains abbreviated (`UI/components/mcp/WebMcpCallStrip.tsx:112`). |
| A4 approvals | 8 | Call-derived effects and digest-matched definitions support informed decisions, but disappearing approvals lack authoritative expiry or terminal-decision records (`UI/components/chat/PermissionCard.tsx:398`; `UI/stores/useWebMcpApprovalOutcome.ts:20`). |
| A5 failure recovery | 8 | Collapsed failures now expose redacted reasons and the first diagnosis finding, but the renderer still replaces specific native initialization errors with `start-failed` (`UI/lib/webMcpFailureSummary.ts:9`; `UI/components/layout/EmbeddedWebMcpBrowser.tsx:264`). |
| A6 evidence after task | 8 | Ordered recaps include outcomes, durations, rejection details and never-called tools, but approval-derived input evidence remains bounded and memory-only (`UI/components/views/git/ReviewLandingBrowserEvidence.tsx:83`; `UI/stores/useWebMcpApprovalOutcome.ts:56`). |
| A7 pause and take over | 8 | Separate pause/disconnect controls preserve the page and distinguish stopped from still-finishing work without promising rollback (`UI/components/layout/EmbeddedWebMcpBrowser.tsx:540`; `E/native-webmcp.js:569`). |
| A8 several sessions | 8 | Waiting-page chips and grid switchers improve concurrent supervision, while page viewing still requires selecting the shared browser surface (`UI/components/supervision/missionControl/MissionControlRow.tsx:283`; `UI/components/sessionGrid/SessionGrid.tsx:289`; `UI/hooks/useWebMcpPages.ts:53`). |
| B1 registered tools | 8 | Raw schemas, hints, advisory lint and named registration rejections are inspectable, but lint does not establish runtime-validator compatibility (`UI/components/mcp/WebMcpToolPanel.tsx:426`; `:982`). |
| B2 try and compare | 8 | Replay now visibly preserves off-list enum values and requires confirmation, while comparison explains missing receipts instead of implying complete evidence (`UI/components/mcp/WebMcpToolPanel.tsx:323`; `:361`; `:874`). |
| B3 iterate | 8 | Retained drafts, registration history and stale markers support iteration, but schema differences remain JSON and omit nested/root-only changes (`UI/components/mcp/WebMcpToolPanel.tsx:1016`; `UI/lib/webMcpPropertyDiff.ts:14`). |
| B4 diagnose misuse | 8 | Digest-bound checks and redacted runtime findings provide useful diagnosis, but unavailable receipts and unsupported constraints limit coverage (`UI/lib/webMcpDiagnosis.ts:231`; `UI/components/mcp/WebMcpCallDiagnosis.tsx:34`). |
| B5 onboarding docs | 8 | The runnable guide covers registration through comparison and export with honest receipt limits, but onboarding remains documentation-led (`docs/webmcp-page-tools.md:12`; `:305`). |

**Means:** A **65/8 = 8.125 → 8.13**; B **40/5 = 8.00**.

Against the supplied round-25 distributions, **A5 and B2 reach 8 here versus their previous medians of 7**; absent ballots prevent judge-specific comparisons. Against the recorded round-24 Codex ballot, **B2 moves 7→8**; all other integer scores hold. A3, B4 and A8 improve within their existing scores.

The three highest-impact changes are:

1. Preserve and render initialization stage/reason through the renderer error boundary (**A5**).
2. Provide runtime-issued completed-call receipts and authoritative approval outcomes, including calls without observed approvals (**B2, B4, A4, A6**).
3. Render readable, recursive before/after schema differences covering nested and root constraints (**B3, B1, B4**).

All thirteen reach 8 on this ballot; majority passage requires another judge’s agreement.

