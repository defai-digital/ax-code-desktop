## Round 28 judgment — `e36aad55` (UI source `92775899`): A **8.13/10**, B **8.00/10**

Read-only session; the shell was denied, so this is source judgment with no test or `git` verification. Short-hands: `UI`=`desktop/packages/ui/src`, `E`=`desktop/packages/electron/src`, `S`=`desktop/shared`.

Round 28 verified in source: echo masking of a masked value under *any* descendant key, still local and idempotent (`S/webmcp-redaction.mjs:147-196`; `S/webmcp-redaction.test.mjs:280-301`); page and binding retention when a window close is refused, for owner close and quit (`E/desktop-webmcp-browser.js:483-499,561`; `E/desktop-webmcp-browser.test.mjs:3424-3475,3478-3498`); value-based credential masking of one field, with reveal (`UI/components/mcp/WebMcpToolPanel.tsx:356,392,398-401`; test `:1149`).

| Step | Score | Judgment |
|---|---:|---|
| A1 discover | 8 | Full descriptions, raw schema, hint badges, lint advice and a visible truncation note exist, but the catalog is still a flat technical list with no grouping or search (`UI/components/mcp/WebMcpToolPanel.tsx:974,982,1008`). |
| A2 enable and scope trust | 9 | Origin, project, session, access state, per-page revoke and close sit in one display-only surface that takes effect on the next call (`UI/components/mcp/WebMcpPages.tsx:106-146,167-177`). |
| A3 watch live | 8 | The strip shows outcome, duration, redacted arguments, digest, result, page marker and approval link, but arguments still truncate at 140 characters (`UI/components/mcp/WebMcpCallStrip.tsx:108-128`). |
| A4 approvals | 8 | Effect sentence from call data, origin, tool, element, digest and the runtime's masked `inputPreview` are clear, but terminal states are only pending/answered/unanswered (`UI/stores/useWebMcpApprovalOutcome.ts:36-49`; `UI/components/chat/WebMcpApprovalToolInfo.tsx:22-36`). |
| A5 failure recovery | 8 | Distinct outcomes, mapped reasons, a stage-named init failure and a diagnosis finding on row and strip exist, but there is no one-action retry (`UI/lib/webMcpFailureSummary.ts:17-21`; `E/native-webmcp.js:152-155`). |
| A6 evidence after task | 8 | The recap lists steps, kinds, durations, digests, definition changes, rejections and never-called tools and copies the whole turn, but carries no inputs (`UI/components/views/git/ReviewLandingBrowserEvidence.tsx:79-107`). |
| A7 pause and take over | 8 | Pause keeps the page and is separate from Disconnect with stopped-versus-finishing counts, no rollback claim, and a refused close now keeps document and bindings, though take-over stays coarse (`UI/components/layout/EmbeddedWebMcpBrowser.tsx:545,582`; `E/desktop-webmcp-browser.test.mjs:3478`). |
| A8 several sessions | 8 | Bounded pool, per-session pages, independent revoke, a waiting chip per row and grid panes reaching their session page work, but only the shown page may be acted on (`UI/components/supervision/missionControl/MissionControlRow.tsx:106,283`; `UI/components/mcp/WebMcpPages.tsx:181-201`). |
| B1 see registered tools | 8 | Schemas, hints, lint, named rejections and truncation are inspectable, but per-field descriptions still cut at 300 characters silently (`UI/lib/webMcpToolForm.ts:29-30`). |
| B2 try by hand and compare | 8 | Honest forms, credential-shaped drafts now masked by value, replay flagging off-enum values before sending, and comparison explaining a missing receipt exist; exact agent input still needs runtime receipts (`WebMcpToolPanel.tsx:326-334,1059`; `UI/lib/webMcpToolForm.ts:148`). |
| B3 iterate | 8 | Registration timeline, retained drafts and stale marks support iteration, but the property diff still renders as one JSON block (`WebMcpToolPanel.tsx:1024-1026`). |
| B4 diagnose misuse | 8 | Digest-bound diagnosis names property, rule and value kind and appears on the collapsed row and strip, bounded to supported rules and known definitions (`UI/lib/webMcpDiagnosis.ts:57-92`; `webMcpFailureSummary.ts:11`). |
| B5 onboarding docs | 8 | The guide is runnable end to end, covers schema limits, CI, troubleshooting and credentials, and is linked in-app, but onboarding remains a document rather than an in-product loop (`docs/webmcp-page-tools.md:12-33,283-303`). |

**Means:** A **65/8 = 8.13**; B **40/5 = 8.00**.

**Versus round 27:** no step moved. Round 28 is a correctness fix — echoed values under arbitrary keys, refused-close bindings, and credential-shaped field values — which raises trust and continuity inside existing 8s, not capability; the ceilings are the same evidence gaps.

**Three changes that would raise the most 8s:**
1. Runtime receipts for every mediated call (redacted input, digest, duration, terminal outcome, correlation id) joined into strip, recap and comparison, plus expired/denied/cancelled approval states with timestamps (**A3, A4, A6, B2, B4**).
2. Retry or re-run directly from a failed row and the strip, prefilled from the recorded input with the diagnosis applied (**A5, A7, B4**).
3. Finish the builder surface: remove the silent 300-character description cap, render the property diff as rows, add catalog grouping or search (**A1, B1, B3**).