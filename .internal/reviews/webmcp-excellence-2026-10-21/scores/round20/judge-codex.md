**Round 20 at `4b7f80db`: A 8.13/10; B 8.00/10.** Reviewed `f06cea02..HEAD`, treating `92775899` as the earlier baseline. All 13 steps reach 8 on this ballot; consensus requires another judge. The revised PRD threshold applies.

Read-only review; no files modified. Shared redaction tests: **9 passed**. No native journeys executed. Runtime credit is limited to verified v7.28.2 fields and Desktop’s actual consumers.

`UI` = `desktop/packages/ui/src`; `E` = `desktop/packages/electron/src`.

| Step | Score | Judgment and source |
|---|---:|---|
| A1 discover | **8** | Origin, descriptions, schemas, hints and catalog limits support discovery, but the collapsed technical inventory still requires substantial inspection (`UI/components/mcp/WebMcpToolPanel.tsx:918`). |
| A2 enable and scope trust | **9** | Visible origin/project/session scope, independent session revocation and explicit project sign-out make access ownership clear (`UI/components/mcp/WebMcpPages.tsx:157`; `UI/components/layout/EmbeddedWebMcpBrowser.tsx:475`). |
| A3 watch live | **8** | Call rows now retain observed approval previews and digests alongside duration, results and transcript navigation, but remain collapsed and bounded (`UI/components/mcp/WebMcpCallStrip.tsx:60`). |
| A4 approvals | **8** | Effect statements and digest-matched definitions contextualize approval, but a disappeared request remains “unanswered,” without an authoritative expiry outcome (`UI/components/chat/PermissionCard.tsx:398`; `UI/stores/useWebMcpApprovalOutcome.ts:20`). |
| A5 failure recovery | **8** | Expanded transcript diagnosis now exposes supplied runtime property paths alongside recovery guidance, while unsupported details remain text (`UI/components/chat/message/parts/ToolPart-impl.tsx:2068`; `UI/lib/webMcpDiagnosis.ts:180`). |
| A6 evidence after the task | **8** | Recaps retain observed digests, rejection details and whole-turn copying, and pair-array credential redaction closes the previous leak, although evidence remains bounded and partly ephemeral (`UI/components/views/git/ReviewLandingBrowserEvidence.tsx:83`; `desktop/shared/webmcp-redaction.mjs:115`). |
| A7 pause and take over | **8** | Separate pause/disconnect controls preserve the page and distinguish confirmed stopping from still-finishing execution without promising rollback (`UI/components/layout/EmbeddedWebMcpBrowser.tsx:540`; `E/native-webmcp.js:531`). |
| A8 several sessions at once | **8** | Session-owned views, independent revocation and actionable waiting-page summaries support concurrent supervision within a bounded pool (`UI/components/mcp/WebMcpPages.tsx:125`; `E/desktop-webmcp-browser.js:73`). |
| B1 see registered tools | **8** | Schemas, hints, advisory lint and named catalog rejections are inspectable, but advisory checks do not establish authoritative runtime-validator parity (`UI/components/mcp/WebMcpToolPanel.tsx:395`; `:936`). |
| B2 try by hand and compare | **8** | Completed calls now join observed approval receipts for meaningful manual comparison, but truncated, evicted or unobserved previews still leave gaps (`UI/lib/webMcpCalls.ts:132`; `UI/components/mcp/WebMcpToolPanel.tsx:268`). |
| B3 iterate | **8** | Prototype-safe draft storage preserves accepted property names and reports capacity limits, while registration changes still appear as a raw JSON diff (`UI/stores/useWebMcpBrowserStore.ts:503`; `UI/components/mcp/WebMcpToolPanel.tsx:971`). |
| B4 diagnose misuse | **8** | Diagnosis checks complete retained values against the digest-named definition, explicitly reports missing definitions and renders supplied rejection paths, but remains limited to supported constraints and available previews (`UI/lib/webMcpDiagnosis.ts:228`; `UI/components/mcp/WebMcpCallDiagnosis.tsx:87`). |
| B5 onboarding docs | **8** | The runnable guide covers registration through regression export and now accurately explains receipt retention, truncation and missing-definition limits (`docs/webmcp-page-tools.md:12`; `:305`). |

**Means:** A **65/8 = 8.125**, rounded **8.13**; B **40/5 = 8.00**.

Compared with the **round 19 Codex ballot**, **A6, B2, B3 and B4 rise 7→8**; every other score holds.

Three highest-impact changes:

1. Provide runtime-issued completed-call receipts, including calls without observed approval events, with explicit completeness and retention status (**B2/B4/A6**).
2. Render readable schema-difference rows, including nested/root changes, and expose runtime-supported validation capabilities (**B1/B3/B4**).
3. Supply authoritative approval terminal outcomes and verify actual expiry behavior against the pinned runtime (**A4/A5**).

