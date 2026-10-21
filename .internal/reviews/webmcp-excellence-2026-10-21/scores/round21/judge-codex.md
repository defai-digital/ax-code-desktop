**Round 21 at `15f40f1d`: A 8.13/10; B 8.00/10.** Reviewed `4b7f80db..HEAD`; `92775899` is an ancestor. All thirteen steps reach 8 on this ballot; passing requires a second judge’s agreement.

Read-only; no files modified. Shared-redaction tests: **12 passed**. No native journeys or screenshots verified. Runtime credit is limited to v7.28.2’s actual payload, including approval-only `definitionDigest` and `inputPreview`.

`UI` = `desktop/packages/ui/src`; `E` = `desktop/packages/electron/src`; `S` = `desktop/shared`.

| Step | Score | Judgment and source |
|---|---:|---|
| A1 discover | 8 | Descriptions, schemas, hints, origin and catalog limits support informed discovery, but capabilities remain a technical disclosure tree (`UI/components/mcp/WebMcpToolPanel.tsx:920`). |
| A2 enable and scope trust | 9 | Origin/project/session ownership, independent revocation and explicit project sign-out make access scope clear (`UI/components/mcp/WebMcpPages.tsx:157`; `UI/components/layout/EmbeddedWebMcpBrowser.tsx:475`). |
| A3 watch live | 8 | The initially open strip exposes arguments, duration, digest, results and transcript navigation, though its summaries and receipt coverage remain bounded (`UI/components/mcp/WebMcpCallStrip.tsx:27`; `:107`). |
| A4 approvals | 8 | Call-derived effects, digest-matched definitions and shared argument filtering support decisions, but disappeared approvals still lack authoritative terminal outcomes (`UI/components/chat/PermissionCard.tsx:398`; `UI/stores/useWebMcpApprovalOutcome.ts:20`). |
| A5 failure recovery | 8 | Distinct uncertain outcomes and property-mapped, safely redacted rejection details aid recovery, while structured reason extraction remains heuristic (`UI/components/mcp/WebMcpToolPanel.tsx:632`; `UI/lib/webMcpDiagnosis.ts:186`). |
| A6 evidence after the task | 8 | Recaps provide navigable calls, durations, digests, rejection details and whole-turn copying, but retained argument evidence remains ephemeral (`UI/components/views/git/ReviewLandingBrowserEvidence.tsx:83`; `UI/stores/useWebMcpApprovalOutcome.ts:56`). |
| A7 pause and take over | 8 | Separate pause/disconnect controls preserve the page and expose stopped versus still-finishing acknowledgements without promising rollback (`UI/components/layout/EmbeddedWebMcpBrowser.tsx:540`; `E/native-webmcp.js:531`). |
| A8 several sessions at once | 8 | Session-owned pages, independent revocation, waiting-page actions and a bounded pool support concurrent supervision (`UI/components/mcp/WebMcpPages.tsx:101`; `E/desktop-webmcp-browser.js:73`). |
| B1 see registered tools | 8 | Schemas, hints, advisory lint and named catalog rejections are inspectable, although lint cannot establish runtime-validator parity (`UI/components/mcp/WebMcpToolPanel.tsx:395`; `:939`). |
| B2 try by hand and compare | 8 | Manual comparison now preserves complete inputs and suppresses incomplete exports, but agent-side evidence still depends on observed approval receipts (`UI/lib/toolHelpers.ts:412`; `UI/components/mcp/WebMcpToolPanel.tsx:288`). |
| B3 iterate | 8 | Registration history, retained drafts and stale-result handling support iteration, but schema changes remain a raw JSON diff (`UI/components/mcp/WebMcpToolPanel.tsx:973`; `:999`). |
| B4 diagnose misuse | 8 | Digest-bound diagnosis no longer invents missing properties from truncated projections, but supported constraints and available receipts still limit coverage (`UI/lib/webMcpDiagnosis.ts:231`; `UI/components/mcp/WebMcpToolPanel.tsx:252`). |
| B5 onboarding docs | 8 | The runnable guide covers registration through regression export and explains receipt limits, but onboarding remains documentation-led (`docs/webmcp-page-tools.md:12`; `:305`). |

**Means:** A **65/8 = 8.125 → 8.13**; B **40/5 = 8.00**.

**Movement versus round 20 Codex:** no whole-point changes. Round 21 materially strengthens A4–A6, B2 and B4: structured arguments reach the shared redactor, field identifiers govern sensitive sibling values, and incomplete projections disable diagnosis/export (`UI/lib/toolHelpers.ts:447`; `S/webmcp-redaction.mjs:146`; `UI/lib/webMcpDiagnosis.ts:140`). These repair correctness without removing the remaining excellence limits.

Three highest-impact changes:

1. Deliver runtime-issued completed-call receipts with explicit completeness, including calls without observed approvals (**B2/B4/A6**).
2. Render readable nested/root schema-difference rows and runtime-supported validation capabilities (**B1/B3/B4**).
3. Provide authoritative approval expiry, denial and cancellation outcomes with timestamps (**A4/A5**).

