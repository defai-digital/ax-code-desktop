我先對照 PRD、第 21 輪分數與 `15f40f1d..HEAD` 的原始碼，再逐項給分。HEAD 是 `5193b0c8`，`92775899` 是第 15 輪祖先。我會以目前原始碼核對第 22–24 輪的變更，並對照第 21 輪分數。**Round 24 at `5193b0c8`.** Judged `desktop/packages/ui/src`, `desktop/packages/electron/src`, and `docs/`. v7.28.2 supplies `definitionDigest` and a redacted `inputPreview` on the approval ask. Desktop renders that shape (`PermissionCard.tsx:413`, `toolHelpers.ts:446`).

Verified in `15f40f1d..HEAD`: every path segment, quoted compound name, and bracketed assignment carries sensitivity, and a sensitive field inherits into nested value keys (`webmcp-redaction.mjs:97`). JSON drafts mask when that redactor would change them (`WebMcpToolPanel.tsx:500`). Native start aborts after 2 seconds or when the guest dies (`native-webmcp.js:114`). Owner close waits for page confirmation and keeps the page for the next window (`desktop-webmcp-browser.js:481`, `:520`). Advisory diagnosis walks every property (`webMcpToolForm.ts:90`). The guide still stops at pair redaction (`docs/webmcp-page-tools.md:320`).

| Step | Score | Judgment |
|---|---:|---|
| A1 discover | 8 | The catalog stays collapsed; truncation and a named rejection show outside, while origin, hints, and schema sit inside (`WebMcpToolPanel.tsx:930`). |
| A2 enable and scope trust | 9 | Sign-out runs through the close confirmation and clears that project's partition (`EmbeddedWebMcpBrowser.tsx:481`); owner close uses the same gate (`desktop-webmcp-browser.js:541`). |
| A3 watch live | 8 | The strip shows the retained preview, an 8-character digest, and an enum failure reason, with arguments cut at 140 (`WebMcpCallStrip.tsx:109`). |
| A4 approvals | 8 | The card shows the shared-redactor preview and one digest; a vanished request stays unanswered (`PermissionCard.tsx:478`). |
| A5 failure recovery | 7 | The collapsed row says only that the call failed (`ToolPart-impl.tsx:1685`); the error string appears after expand (`:994`). |
| A6 evidence after the task | 8 | The recap copies rejections, digest, and duration, and names an unknown association (`ReviewLandingBrowserEvidence.tsx:98`). |
| A7 pause and take over | 8 | Pause waits 500 ms and reports stopped or still finishing (`native-webmcp.js:10`); a destroyed page resolves as stopped (`:542`). |
| A8 several sessions | 8 | Each session keeps its page, a hidden call shows waiting, and revoke is per session (`WebMcpPages.tsx:123`); a dead owner retains the page for the next window (`desktop-webmcp-browser.js:520`). |
| B1 see registered tools | 8 | Kind, hints, schema, and a named rejection sit behind the same collapsed catalog (`WebMcpToolPanel.tsx:672`). |
| B2 try and compare | 8 | Export stops when the input is truncated (`webMcpDiagnosis.ts:140`), a truncated manual run is stored as `{}` (`useWebMcpBrowserStore.ts:579`), and JSON drafts mask when the redactor would change them (`WebMcpToolPanel.tsx:500`). |
| B3 iterate | 8 | The journal records truncation (`useWebMcpBrowserStore.ts:579`); the property diff is one JSON blob (`WebMcpToolPanel.tsx:982`). |
| B4 diagnose misuse | 8 | A truncated call is labelled truncated (`webMcpDiagnosis.ts:235`) and diagnosis names every primitive property (`webMcpToolForm.ts:90`); a call with no receipt has no input (`toolHelpers.ts:400`). |
| B5 onboarding docs | 8 | The guide records the 2 KiB preview, memory-only receipts, and pair redaction (`docs/webmcp-page-tools.md:308`). |

**Means:** A **8.00** (64/8). B **8.00** (40/5).

**Versus round 21** (this ballot): **no score moved.** A5 stays 7. Indexed and quoted paths, bracketed assignments, inherited field sensitivity, JSON-draft masking, a 2-second native start, full-schema diagnosis, and owner-window page recovery make the same surfaces safer. The collapsed failure row, the JSON diff, and receipt-only diagnosis are unchanged.

**Three changes that lift the lowest steps most:**

1. Show the persisted error on the collapsed row and the strip, and when `webMcpRuntimeRejections` has a property, show that property and rule. The row uses a generic failed label (`ToolPart-impl.tsx:1685`). That lifts **A5** and **A3**.
2. When no approval receipt exists, diagnose the tool-call input already on the part. `readWebMcpInvokeInput` returns missing without `metadata.arguments`, `metadata.input`, or `inputPreview` (`toolHelpers.ts:400`). That lifts **B4** and rejected-call **B2**.
3. Render `propertyDiff` as rows (`WebMcpToolPanel.tsx:982`), and make `webMcpResultPreview` report truncation when it keeps 64 fields (`toolHelpers.ts:328`). That lifts **B3** and the result side of **A6**.
