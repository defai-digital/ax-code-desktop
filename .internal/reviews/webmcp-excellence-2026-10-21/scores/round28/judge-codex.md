**Round 28 at `e36aad55`: A = 8.13/10; B = 8.00/10.**

Judged round-28 HEAD; `92775899` is an older ancestor. Read-only; no files modified. All **24 shared-redaction tests passed**; native journeys and screenshots were not verified. Runtime credit includes v7.28.2’s actual approval `definitionDigest` and redacted `inputPreview`, without credit for unsent fields.

Paths: `UI` = `desktop/packages/ui/src`; `E` = `desktop/packages/electron/src`; `S` = `desktop/shared`.

| Step | Score | Judgment and source |
|---|---:|---|
| A1 discover | 8 | Descriptions, schemas, hints, origin and explicit catalog limits support discovery, but capabilities remain a flat technical disclosure list (`UI/components/mcp/WebMcpToolPanel.tsx:964`). |
| A2 enable and scope trust | 9 | Origin, project, session, access scope, independent revocation and project sign-out make trust understandable and controllable (`UI/components/mcp/WebMcpPages.tsx:162`; `UI/components/layout/EmbeddedWebMcpBrowser.tsx:475`). |
| A3 watch live | 8 | The strip exposes outcomes, duration, redacted arguments, results and approval navigation, but argument previews truncate at 140 characters (`UI/components/mcp/WebMcpCallStrip.tsx:112`). |
| A4 approvals | 8 | Call-derived effects, digest-matched definitions and runtime previews inform decisions, but disappeared approvals lack authoritative expiry, denial or cancellation records (`UI/components/chat/PermissionCard.tsx:398`; `UI/stores/useWebMcpApprovalOutcome.ts:6`). |
| A5 failure recovery | 8 | Collapsed failure summaries expose reasons and findings, but specific native initialization failures still become generic `start-failed` errors in the renderer (`UI/lib/webMcpFailureSummary.ts:9`; `UI/components/layout/EmbeddedWebMcpBrowser.tsx:264`). |
| A6 evidence after task | 8 | Ordered recaps provide outcomes, durations, digests, rejection details and never-called tools, but omit call inputs and depend on ephemeral approval receipts (`UI/components/views/git/ReviewLandingBrowserEvidence.tsx:83`; `UI/stores/useWebMcpApprovalOutcome.ts:56`). |
| A7 pause and take over | 8 | Separate pause/disconnect controls preserve the page and distinguish stopped from still-finishing work, honestly exposing incomplete cancellation (`UI/components/layout/EmbeddedWebMcpBrowser.tsx:540`; `E/native-webmcp.js:569`). |
| A8 several sessions | 8 | Waiting chips, session-specific grid controls and corrected cancelled-close bindings support supervision, although pages still share one visible browser surface (`UI/components/sessionGrid/SessionGrid.tsx:289`; `E/desktop-webmcp-browser.js:489`). |
| B1 registered tools | 8 | Raw schemas, hints, advisory lint and named rejections are inspectable, but field guidance silently truncates descriptions at 300 characters (`UI/components/mcp/WebMcpToolPanel.tsx:434`; `UI/lib/webMcpToolForm.ts:30`). |
| B2 try and compare | 8 | Manual journals, explicit off-list replay confirmation and credential-shaped input masking improve experimentation, while agent comparison remains limited by available approval receipts (`UI/components/mcp/WebMcpToolPanel.tsx:323`; `:356`; `:894`). |
| B3 iterate | 8 | Registration history, retained drafts and stale markers support iteration, but schema differences remain raw JSON and omit nested/root-only changes (`UI/components/mcp/WebMcpToolPanel.tsx:1025`; `UI/lib/webMcpPropertyDiff.ts:14`). |
| B4 diagnose misuse | 8 | Digest-bound diagnosis and broader echo filtering protect diagnostic evidence, but supported constraints and missing receipts still limit explanations (`UI/lib/webMcpDiagnosis.ts:227`; `S/webmcp-redaction.mjs:209`). |
| B5 onboarding docs | 8 | The runnable guide covers registration, manual testing, agent comparison and regression export with honest receipt limits, but lacks an integrated guided exercise (`docs/webmcp-page-tools.md:12`; `:305`). |

**Means:** A **65/8 = 8.125 → 8.13**; B **40/5 = 8.00**.

**Compared with round 27: no integer scores moved.** Round 28 strengthens B2’s input privacy, B4’s diagnostic privacy and A8’s ownership correctness within their existing 8s; those fixes do not remove their remaining excellence limits.

The three highest-impact changes are:

1. Deliver completed-call receipts and authoritative terminal approval outcomes, including calls without observed approvals (**A3/A4/A6/B2/B4**).
2. Preserve native initialization stage/reason through the renderer and provide specific recovery actions (**A5**).
3. Render recursive before/after schema differences covering nested and root constraints (**B1/B3/B4**).

All thirteen steps reach 8 on this ballot; majority passage requires another judge’s agreement.

