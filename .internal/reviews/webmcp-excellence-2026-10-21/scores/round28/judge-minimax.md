## Round 28 judgment at `e36aad55` (source `92775899`)

Read-only; no files modified. No shell or test runner was available, so this is source judgment, not execution evidence. `UI` = `desktop/packages/ui/src`, `E` = `desktop/packages/electron/src`, `S` = `desktop/shared`.

Verified in source: round 28's three changes — echo masking under any key (`S/webmcp-redaction.mjs:240`), value-based input masking in forms and JSON drafts (`UI/components/mcp/WebMcpToolPanel.tsx:356,539-547`), and bindings kept after a cancelled owner close (`E/desktop-webmcp-browser.js:494-498` "Restore only the current renderer binding"); plus the pool bound and LRU unload (`E/desktop-webmcp-browser.js:74,930-933`), the trust surface (`UI/components/mcp/WebMcpPages.tsx:167-177`), pause separate from disconnect (`UI/components/layout/EmbeddedWebMcpBrowser.tsx:545,554,582,595-606`), the recap (`UI/components/views/git/ReviewLandingBrowserEvidence.tsx:83-107,201-205`), and the approval card reading only what v7.28.2 sends (`UI/lib/toolHelpers.ts:376-383,446-452`).

| Step | Score | Judgment |
|---|---:|---|
| A1 discover | 8 | Catalog gives descriptions, hint badges, raw schema, lint, origin and a truncation note (`WebMcpToolPanel.tsx:744-753,982-989`), but it is a flat technical list with no grouping or search, and per-field help is silently cut at 300 characters (`webMcpToolForm.ts:30`). |
| A2 enable and scope trust | 9 | Origin, project, session, access state, per-page revoke and sign-out sit in one display-only surface effective on the next call, with no "always allow" for the desktop provider (`WebMcpPages.tsx:119,129-139,167-177`; `PermissionCard.tsx:207-213`). |
| A3 watch live | 8 | The strip carries outcome, duration, redacted arguments, digest, result, an earlier-page marker and an approval link that reveals and focuses the card (`WebMcpCallStrip.tsx:100-140`), but arguments are truncated at 140 characters (`:114`) and a running invoke shows no progress beyond its state. |
| A4 approvals | 7 | The effect sentence is built only from call data and the page's description is labelled its claim (`toolHelpers.ts:481-482`; `WebMcpApprovalToolInfo.tsx:75-83`), but terminal states are only pending/answered/unanswered — no expired, denied or cancelled, and no timestamp (`stores/useWebMcpApprovalOutcome.ts:6`), while the runtime sends only `definitionDigest` and a redacted `inputPreview`. |
| A5 failure recovery | 7 | Distinct outcomes, mapped rejection reasons and a redacted reason plus first diagnosis finding on both the collapsed row and the strip (`webMcpFailureSummary.ts:17-21`; `ToolPart-impl.tsx:2055`), but a failed call offers no one-action retry or re-run. |
| A6 evidence after the task | 7 | The recap lists steps, kinds, durations, digests, rejections, definition changes and never-called tools and copies the whole turn (`ReviewLandingBrowserEvidence.tsx:83-107,201-205`), but it carries no inputs and no screenshot or page artifact. |
| A7 pause and take over | 8 | Pause is separate from Disconnect, keeps the page, and acknowledges cancellation honestly as stopped versus still finishing without claiming rollback (`EmbeddedWebMcpBrowser.tsx:545,554,582,595-606`), but take-over is page-level, with no per-call control. |
| A8 several sessions at once | 8 | A bounded pool (4, configurable 1–8) keyed by project and session, per-project partitions, LRU unload keeping the address in memory only, waiting chips and grid panes all work (`desktop-webmcp-browser.js:74,930-933`; `WebMcpPages.tsx:128,203-218`), but only the shown page may be acted on. |

**Mean A: 62/8 = 7.75**

| Step | Score | Judgment |
|---|---:|---|
| B1 see registered tools | 8 | Full descriptions, raw schema, badges, lint, named rejections and truncation are inspectable (`WebMcpToolPanel.tsx:752-753,990-1002`), but the 300-character field-description cap is silent. |
| B2 try by hand and compare | 8 | Honest forms, value-based masking, replay that flags off-enum values before sending, side-by-side comparison explaining a missing receipt, and a regression snippet all work (`WebMcpToolPanel.tsx:363,882,1055-1078,323-337,145-195`), but exact agent input still depends on runtime receipts. |
| B3 iterate | 8 | Registration timeline with property diff, drafts kept across reload and stale marks survive changes (`WebMcpToolPanel.tsx:556-558,1012-1029`), but the property diff renders as one JSON block (`:1025`). |
| B4 diagnose misuse | 8 | Digest-bound diagnosis and runtime rejections surface on the row, the strip and the recap (`webMcpFailureSummary.ts:11-16`; `ReviewLandingBrowserEvidence.tsx:98-100,183`), bounded to supported rules and known definitions. |
| B5 onboarding docs | 8 | A runnable guide with a quickstart example is linked from the tool panel (`docs/webmcp-page-tools.md:7,17,143`; `WebMcpBuilderHint.tsx:7`), but onboarding remains a document rather than an in-product loop. |

**Mean B: 40/5 = 8.00**

**Versus round 27:** no step moved. Round 28 is a correctness round — echo masking under any key, value-based input masking, and bindings surviving a cancelled close all prevent disclosure or state loss; they raise trust, not capability. The ceilings are unchanged and set by the same three gaps: no terminal approval states, no retry from a failure, and no inputs or artifacts in the recap. Round 27's four ballots scoring every step 8 or more is not reproduced here: A4, A5 and A6 fall to 7 on the evidence above.

**Three changes that would raise the lowest steps most:**

1. **Terminal approval receipts** — expired, denied and cancelled with timestamps and responder, joined to the strip and recap (`A4, A5`).
2. **One-action retry from a failed row or strip**, prefilled from the recorded input with the diagnosis applied (`A5, A7, B4`).
3. **Runtime receipts for every mediated call** — correlation id, duration, terminal outcome and redacted input — so comparison and the recap stop degrading to "receipt missing" (`A6, B2, B4`).