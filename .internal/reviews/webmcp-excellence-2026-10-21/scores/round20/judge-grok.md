我先對照 PRD、第 19 輪評分與 `f06cea02..HEAD` 的原始碼，再依絕對標準給第 20 輪分數。第 20 輪的 diff 集中在核准回執、診斷與遮罩。我接著核對這些路徑是否真的接到已完成呼叫與 runtime 送出的欄位。**Round 20 at `4b7f80db`.** Judged `desktop/packages/ui/src`, `desktop/packages/electron/src`, and `docs/`. v7.28.2 puts `definitionDigest` and a redacted `inputPreview` on the approval ask only (`desktop_webmcp.ts:216-228`). A thrown failure persists `state.error` as that message and drops `reason`, `nextAction`, and `path` (`processor-impl.ts:1264-1270`). Schema checks run in `prepareInvocation` before `ctx.ask`, so those calls never get a receipt.

Verified in `f06cea02..HEAD`: completed calls keep the approval preview and digest in a 256-entry memory map (`useWebMcpApprovalOutcome.ts:32`); diagnosis uses that digest’s retained definition and says when it is gone (`webMcpDiagnosis.ts:235`); `[name,value]`, `{name,value}`, and `{key,value}` are redacted (`webmcp-redaction.mjs:116`); draft names are kept up to 128 fields (`useWebMcpBrowserStore.ts:503`). Structured `path` / `field` / `keyword` mapping exists (`webMcpDiagnosis.ts:202`) but does not see the failure shape v7.28.2 actually stores.

| Step | Score | Judgment |
|---|---:|---|
| A1 discover | 8 | Hint badges, origin, truncation, and distinct credential labels remain a collapsed catalog (`desktop/shared/webmcp-catalog-projection.cjs:57`). |
| A2 enable and scope trust | 9 | Sign-out clears that project’s partition after the unsaved-work check; saved history stays origin-only (`desktop/packages/ui/src/components/layout/EmbeddedWebMcpBrowser.tsx:482`). |
| A3 watch live | 8 | The strip shows the retained preview and digest after approval, still capped and without the failure property (`desktop/packages/ui/src/components/mcp/WebMcpCallStrip.tsx:107`). |
| A4 approvals | 8 | The card still matches one digest, keeps the truncation marker, and expands the page description (`desktop/packages/ui/src/components/chat/WebMcpApprovalToolInfo.tsx:76`). |
| A5 failure recovery | 7 | The collapsed row still says the call failed, and a v7.28.2 rejection is repeated as prose rather than a property (`desktop/packages/ui/src/components/chat/message/parts/ToolPart-impl.tsx:1685`). |
| A6 evidence after the task | 8 | The recap copies the turn, names an unknown association, and adds the error text; arguments stay off the copy and vanish on restart (`desktop/packages/ui/src/components/views/git/ReviewLandingBrowserEvidence.tsx:98`). |
| A7 pause and take over | 8 | Pause waits 500 ms and reports stopped or still finishing, leaving the page with the person (`desktop/packages/electron/src/native-webmcp.js:11`). |
| A8 several sessions | 8 | Each session keeps its own page, hidden calls wait, and eviction probes unsaved work (`desktop/packages/electron/src/browser-eviction.js:24`). |
| B1 see registered tools | 8 | Kind, hints, origin, display schema, and a named rejection are visible before any grant (`desktop/packages/ui/src/components/mcp/WebMcpToolPanel.tsx:700`). |
| B2 try and compare | 8 | Try, replay, and export bind to the main-issued id plus digest, and an approved call can now be compared until the 256-receipt cap (`desktop/packages/ui/src/lib/webMcpCalls.ts:132`). |
| B3 iterate | 8 | History keeps 32 events and every accepted draft name, while the property diff is still one JSON blob (`desktop/packages/ui/src/components/mcp/WebMcpToolPanel.tsx:971`). |
| B4 diagnose misuse | 8 | A completed call is checked against the digest-named definition, or told that definition is gone, but a rejection before approval still has no input to check (`desktop/packages/ui/src/lib/webMcpDiagnosis.ts:235`). |
| B5 onboarding docs | 8 | The guide records memory-only receipts, the 2 KiB preview, unavailable definitions, and draft limits (`docs/webmcp-page-tools.md:311`). |

**Means:** A **8.00** (64/8). B **8.00** (40/5).

**Versus round 19** (this ballot): **B4 moved 7→8**. A5 stays 7. No other step moved. Pair redaction and lossless draft names hold A6 and B3 at 8.

**Three changes that lift the lowest steps most:**

1. Show the persisted error on the collapsed row and the strip, and turn a schema pointer in that sentence into the failing property. v7.28.2 does not leave `path` on the error part, and the string visitor only stores text (`webMcpDiagnosis.ts:196`). That lifts **A5**.
2. When validation throws before approval, diagnose the redacted input already on the tool part against the digest that call names. `readWebMcpInvokeInput` ignores it today (`toolHelpers.ts:407`). That lifts the rest of **B4** and rejected-call **B2**.
3. Render `propertyDiff` as rows, and include the redacted arguments in the copied recap. Receipts are memory-only (`useWebMcpApprovalOutcome.ts:31`). That lifts **B3** and **A6**.
