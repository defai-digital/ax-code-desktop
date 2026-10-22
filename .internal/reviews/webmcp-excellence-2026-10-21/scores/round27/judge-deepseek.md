**Round 27 at `1442693e` (source `92775899`): A 8.13/10; B 8.00/10.** Read-only; nothing modified. No shell/test runner was available in this session, so this is source judgment, not execution evidence. `UI` = `desktop/packages/ui/src`; `E` = `desktop/packages/electron/src`; `S` = `desktop/shared`.

I verified in source: round 26's failed-call reason plus first diagnosis finding on the collapsed row and the strip (`UI/lib/webMcpFailureSummary.ts:11-20`; `UI/components/chat/message/parts/ToolPart-impl.tsx:2055`; `UI/components/mcp/WebMcpCallStrip.tsx:128,151`), the specific native init reason including stage and timeout (`E/native-webmcp.js:153-155`), replay flagging an off-enum value with a confirm-labelled send (`UI/lib/webMcpToolForm.ts:148`; `UI/components/mcp/WebMcpToolPanel.tsx:874,886`), compare naming a missing runtime receipt (`WebMcpToolPanel.tsx:326-334`), the Mission Control waiting chip on the shared Needs-you rule (`UI/components/supervision/missionControl/MissionControlRow.tsx:106,283`; `UI/lib/webMcpViewKey.ts:24`), grid panes reaching their own session's page (`UI/components/sessionGrid/SessionGrid.tsx:289`; `UI/components/mcp/WebMcpPages.tsx:181-201`), and round 27's echo masking of a sensitive field value wherever diagnostic prose repeats it (`S/webmcp-redaction.mjs:128-165,170-171,186,209`; `S/webmcp-redaction.test.mjs:240,268`).

| Step | Score | Judgment |
|---|---:|---|
| A1 discover | 8 | Full description, raw schema, hint badges, lint advice and a visible truncation note exist, but the catalog is still a flat technical list with no capability grouping or search (`WebMcpToolPanel.tsx:724,471,408,428,974`). |
| A2 enable and scope trust | 9 | Origin, project, session, access state, per-page revoke and sign-out sit in one display-only surface that takes effect on the next call (`WebMcpPages.tsx:167-177`; `WebMcpToolPanel.tsx:998`; `i18n/messages/en.ts:36,2691`). |
| A3 watch live | 8 | The strip shows outcome, duration, redacted arguments, digest, result, earlier-page marker, approval link and now a redacted failure line, but arguments still truncate at 140 characters (`WebMcpCallStrip.tsx:108-128`). |
| A4 approvals | 8 | Effect sentence from call data, origin, tool, element and digest are clear and the runtime's masked `inputPreview` is reused, but terminal states are only pending/answered/unanswered — no expired, denied or cancelled with timestamps (`PermissionCard.tsx:398-421`; `UI/stores/useWebMcpApprovalOutcome.ts:6,39`). |
| A5 failure recovery | 8 | Distinct outcomes, mapped rejection reasons, bounded init failure naming its stage, a diagnosis finding on the row, but no one-action retry (`E/native-webmcp.js:153`; `webMcpFailureSummary.ts:17-21`). |
| A6 evidence after the task | 8 | The recap lists steps, kinds, durations, digests, rejections, definition changes and never-called tools and copies the whole turn, but carries no inputs (`UI/components/views/git/ReviewLandingBrowserEvidence.tsx:83-107`). |
| A7 pause and take over | 8 | Pause keeps the page and is separate from Disconnect with stopped-versus-finishing counts and no rollback claim, though take-over is still coarse (`UI/components/layout/EmbeddedWebMcpBrowser.tsx:545,582`). |
| A8 several sessions at once | 8 | Bounded pool, per-session pages, independent revoke, a waiting chip on each row and grid panes that reach their session's page work, but only the shown page may be acted on (`MissionControlRow.tsx:106-108`; `SessionGrid.tsx:289`). |
| B1 see registered tools | 8 | Schemas, hints, lint, named rejections and truncation are inspectable, but per-field form aids still cut descriptions at 300 characters silently (`UI/lib/webMcpToolForm.ts:30`). |
| B2 try by hand and compare | 8 | Full forms, masked drafts, replay that flags off-enum values before sending, side-by-side comparison that explains a missing receipt, and test export exist; exact agent input still needs approval receipts (`WebMcpToolPanel.tsx:874,326,1051`). |
| B3 iterate | 8 | Registration history, retained drafts and stale marks support iteration, but the property diff still renders as one JSON block (`WebMcpToolPanel.tsx:1017`). |
| B4 diagnose misuse | 8 | Digest-bound diagnosis names property, rule and value kind and now also appears on the collapsed row and strip, bounded to supported rules and known definitions (`UI/lib/webMcpDiagnosis.ts:57-92`; `webMcpFailureSummary.ts:11`). |
| B5 onboarding docs | 8 | The guide is runnable end to end and linked in-app, but onboarding remains a document rather than an in-product loop (`docs/webmcp-page-tools.md:7,24`). |

**Means:** A **65/8 = 8.13**; B **40/5 = 8.00**.

**Versus round 26:** no step moved. Round 27 is a correctness fix — a sensitive field's value can no longer survive in a sibling diagnostic's prose — which raises trust, not capability. Round 26's row-level failure reason, off-enum replay confirm, receipt explanation and waiting chip deepen A5, B2, B4 and A8 within their existing 8s; their ceilings are set by the same evidence and recovery gaps.

Three changes that would raise the most 8s:

1. Runtime receipts for **every** mediated call — redacted input, definition digest, duration, terminal outcome, correlation id — joined into strip, recap and comparison (**A3, A6, B2, B4**).
2. Retry or re-run directly from a failed row and the strip, prefilled from the recorded input with the diagnosis applied (**A5, A7, B4**).
3. Finish the builder surface: remove the silent 300-character field-description cap, render the property diff as rows, add catalog grouping or search (**A1, B1, B3**).