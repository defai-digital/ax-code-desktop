I'll judge the WebMCP experience from source only: the controlling PRD, round-20 ballots, and the commits since `4b7f80db`. No files will be changed.HEAD is `15f40f1d`. Next I’ll check the round-21 diff against the shared redactor, sibling-key sensitivity, and projection behavior.**Round 21 at `15f40f1d`.** Judged `desktop/packages/ui/src`, `desktop/packages/electron/src`, and `docs/`. v7.28.2 puts `definitionDigest` and a redacted `inputPreview` on the approval ask only.

Verified in `4b7f80db..HEAD`: argument, approval, and error text go through `redactWebMcpReport` (`toolHelpers.ts:304`, `webMcpDiagnosis.ts:227`, `ToolPart-impl.tsx:994`). A sensitive `field`, `path`, or `instancePath` redacts sibling `got`, `value`, and `received` (`webmcp-redaction.mjs:83`). `readWebMcpInvokeInput` keeps every property, or returns `truncated` and null (`toolHelpers.ts:416`). That status blocks missing-property findings and export (`webMcpDiagnosis.ts:235`, `:140`). Result preview keeps 64 fields (`toolHelpers.ts:328`). Argument text taken from `arguments` is cut at 140 code units (`toolHelpers.ts:447`). The guide does not describe sibling keys or export suppression (`docs/webmcp-page-tools.md:320`).

| Step | Score | Judgment |
|---|---:|---|
| A1 discover | 8 | Hint badges, origin, truncation, and credential labels remain a collapsed catalog (`desktop/packages/ui/src/components/mcp/WebMcpToolPanel.tsx:663`). |
| A2 enable and scope trust | 9 | Sign-out runs through the unsaved-work check and clears that project's partition (`desktop/packages/ui/src/components/layout/EmbeddedWebMcpBrowser.tsx:481`). |
| A3 watch live | 8 | The strip shows the retained preview and digest, capped at 140 characters, with no failure property (`desktop/packages/ui/src/components/mcp/WebMcpCallStrip.tsx:109`). |
| A4 approvals | 8 | The card shows the shared-redactor preview and one digest; a vanished request is "unanswered" (`desktop/packages/ui/src/components/chat/PermissionCard.tsx:478`). |
| A5 failure recovery | 7 | The collapsed row says only that the call failed (`desktop/packages/ui/src/components/chat/message/parts/ToolPart-impl.tsx:1685`); the error string appears after expand (`:994`). |
| A6 evidence after the task | 8 | The recap copies rejections, digest, and duration, and names an unknown association; arguments stay off the copy (`desktop/packages/ui/src/components/views/git/ReviewLandingBrowserEvidence.tsx:98`). |
| A7 pause and take over | 8 | Pause waits 500 ms and reports stopped or still finishing, leaving the page with the person (`desktop/packages/electron/src/native-webmcp.js:11`). |
| A8 several sessions | 8 | Each session has its own page, a hidden call shows waiting, and revoke is per session (`desktop/packages/ui/src/components/mcp/WebMcpPages.tsx:123`). |
| B1 see registered tools | 8 | Kind, hints, origin, schema, and a named rejection sit on the same collapsed row (`desktop/packages/ui/src/components/mcp/WebMcpToolPanel.tsx:663`). |
| B2 try and compare | 8 | Export and replay stop when the input is truncated (`desktop/packages/ui/src/lib/webMcpDiagnosis.ts:140`), while a truncated manual run is stored as `{}` (`desktop/packages/ui/src/stores/useWebMcpBrowserStore.ts:577`). |
| B3 iterate | 8 | The journal records truncation instead of a shortened bag (`useWebMcpBrowserStore.ts:577`); the property diff is one JSON blob (`WebMcpToolPanel.tsx:974`). |
| B4 diagnose misuse | 8 | A truncated call is labelled truncated and is not checked for missing properties (`webMcpDiagnosis.ts:235`); a call with no receipt still has no input (`toolHelpers.ts:388`). |
| B5 onboarding docs | 8 | The guide records the 2 KiB preview, memory-only receipts, and pair redaction (`docs/webmcp-page-tools.md:308`). |

**Means:** A **8.00** (64/8). B **8.00** (40/5).

**Versus round 20** (this ballot): **no score moved.** A5 stays 7. Shared redaction, sibling values, and refusal to diagnose or export a shortened input make B2 and B4 safer. They do not change the collapsed failure row, the JSON diff, or memory-only receipts.

**Three changes that lift the lowest steps most:**

1. Show the persisted error on the collapsed row and the strip, and when `webMcpRuntimeRejections` has a property, show that property and rule. v7.28.2 leaves a string on `state.error`, and the row uses a generic failed label (`ToolPart-impl.tsx:1685`). That lifts **A5** and **A3**.
2. When no approval receipt exists, diagnose the tool-call input already on the part. `readWebMcpInvokeInput` skips `state.input` (`toolHelpers.ts:388`). That lifts **B4** and rejected-call **B2**.
3. Render `propertyDiff` as rows (`WebMcpToolPanel.tsx:974`), and make `webMcpResultPreview` report truncation instead of keeping 64 fields (`toolHelpers.ts:328`). That lifts **B3** and the result side of **A6**.
