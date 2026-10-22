**Round 27 at `1442693e`: A = 8.13/10; B = 8.00/10.**

Judged round-27 HEAD; `92775899` is an older ancestor. Verified `15f40f1d..HEAD` and v7.28.2’s actual approval payload. Credit includes Desktop’s retained `definitionDigest` and redacted `inputPreview`, with no credit for unsent fields. Read-only; no files modified. **22 shared-redaction tests passed**; native journeys and screenshots were not verified.

Paths: `UI` = `desktop/packages/ui/src`; `E` = `desktop/packages/electron/src`; `S` = `desktop/shared`.

| Step | Score | Judgment and source |
|---|---:|---|
| A1 discover | 8 | Descriptions, schemas, hints, origin and catalog limits support discovery, but capability inspection remains behind nested technical disclosures (`UI/components/mcp/WebMcpToolPanel.tsx:964`). |
| A2 enable and scope trust | 9 | Project/session ownership, explicit scope, independent revocation and project sign-out make access understandable and controllable (`UI/components/mcp/WebMcpPages.tsx:162`; `UI/components/layout/EmbeddedWebMcpBrowser.tsx:475`). |
| A3 watch live | 8 | The initially open strip exposes arguments, duration, results, approval navigation and failure summaries, although evidence remains abbreviated (`UI/components/mcp/WebMcpCallStrip.tsx:112`). |
| A4 approvals | 8 | Call-derived effects and digest-matched definitions inform decisions, but disappeared requests lack authoritative expiry and terminal-decision records (`UI/components/chat/PermissionCard.tsx:398`; `UI/stores/useWebMcpApprovalOutcome.ts:20`). |
| A5 failure recovery | 8 | Collapsed failures expose safely filtered reasons and diagnosis, but the renderer still replaces specific native initialization errors with `start-failed` (`UI/lib/webMcpFailureSummary.ts:9`; `UI/components/layout/EmbeddedWebMcpBrowser.tsx:264`). |
| A6 evidence after task | 8 | Ordered recaps provide outcomes, durations, rejection details and never-called tools, but approval-derived input evidence remains bounded and memory-only (`UI/components/views/git/ReviewLandingBrowserEvidence.tsx:83`; `UI/stores/useWebMcpApprovalOutcome.ts:56`). |
| A7 pause and take over | 8 | Separate pause/disconnect controls preserve the page and distinguish stopped from still-finishing work, honestly exposing incomplete cancellation (`UI/components/layout/EmbeddedWebMcpBrowser.tsx:540`; `E/native-webmcp.js:569`). |
| A8 several sessions | 8 | Waiting-page chips and session-specific grid switchers aid supervision, but viewing still requires selecting the shared browser surface (`UI/components/sessionGrid/SessionGrid.tsx:289`; `UI/hooks/useWebMcpPages.ts:53`). |
| B1 registered tools | 8 | Raw schemas, hints, advisory lint and named registration rejections are inspectable, but lint cannot establish authoritative runtime-validator compatibility (`UI/components/mcp/WebMcpToolPanel.tsx:426`; `:982`). |
| B2 try and compare | 8 | Manual journals, explicit off-list replay values and confirmation support honest experimentation, while comparison clearly explains missing runtime receipts (`UI/components/mcp/WebMcpToolPanel.tsx:323`; `:361`; `:874`). |
| B3 iterate | 8 | Retained drafts, registration history and stale markers support iteration, but schema differences remain JSON and omit nested/root-only changes (`UI/components/mcp/WebMcpToolPanel.tsx:1016`; `UI/lib/webMcpPropertyDiff.ts:14`). |
| B4 diagnose misuse | 8 | Digest-bound checks and runtime findings now mask repeated sensitive diagnostic values, while missing receipts and unsupported constraints still limit diagnosis (`UI/lib/webMcpDiagnosis.ts:227`; `S/webmcp-redaction.mjs:206`). |
| B5 onboarding docs | 8 | The runnable guide covers registration, manual testing, agent comparison and regression export with honest receipt limits, but onboarding remains documentation-led (`docs/webmcp-page-tools.md:12`; `:305`). |

**Means:** A **65/8 = 8.125 → 8.13**; B **40/5 = 8.00**.

Compared with the round-26 Codex ballot, **no integer scores moved**. Round 27 strengthens diagnostic privacy across failure displays, comparisons and recaps: sensitive diagnostic values are collected before projection and filtered from repeated prose (`S/webmcp-redaction.mjs:128`, `:170`). This improves correctness without removing the remaining excellence limits.

The three changes with greatest impact on the lowest-scoring steps are:

1. Preserve native initialization stage/reason through the renderer and show a specific recovery action (**A5**).
2. Supply runtime-issued completed-call receipts and authoritative approval outcomes, including calls without observed approvals (**A4/A6/B2/B4**).
3. Render recursive, readable before/after schema differences covering nested and root constraints (**B1/B3/B4**).

All thirteen steps reach **8** on this ballot; majority passage requires another judge’s agreement.

