我先核對評分紀錄與原始碼，只讀不改，再對照第 24 輪給每一項絕對分數。第 24 輪停在 `5193b0c8`；我改核對其後到 `0fb2203e` 的原始碼，並對照 PRD 的步驟定義。**Round 25 at `0fb2203e`.** Judged `desktop/packages/ui/src`, `desktop/packages/electron/src`, and `docs/`. The brief's `92775899` is the round-15 ancestor; HEAD includes `185e35f6` and `a1d05f68`. v7.28.2 approval metadata carries `definitionDigest` and a redacted `inputPreview` (`desktop_webmcp.ts:225`). Desktop shows that digest and preview (`PermissionCard.tsx:413`, `toolHelpers.ts:446`).

Verified here: inherited sensitivity stays on when a descendant names a field (`desktop/shared/webmcp-redaction.mjs:161`); result, schema, and typed-field masking share `webMcpFieldLooksSensitive` (`toolHelpers.ts:315`, `:292`); a diagnostic pair keeps an inherited value (`webmcp-redaction.mjs:150`). Host `render-process-gone` pauses the page (`desktop-webmcp-browser.js:1090`). A destroyed owner follows `ownerGone`, and the next window can adopt the page (`:520`). JSON drafts mask when that redactor would change them (`WebMcpToolPanel.tsx:504`). Native start still aborts at 2 seconds (`native-webmcp.js:114`).

| Step | Score | Judgment |
|---|---:|---|
| A1 discover | 8 | The catalog stays collapsed; truncation and a named rejection show outside, while origin, hints, and schema sit inside (`WebMcpToolPanel.tsx:930`). |
| A2 enable and scope trust | 9 | One trust summary shows origin, project, session, and access, with per-session revoke and project sign-out (`WebMcpPages.tsx:157`). |
| A3 watch live | 8 | The strip shows the retained preview, an 8-character digest, and an enum failure reason, with arguments cut at 140 (`WebMcpCallStrip.tsx:109`). |
| A4 approvals | 8 | The card shows the shared-redactor preview and one digest; a vanished request stays unanswered (`PermissionCard.tsx:478`). |
| A5 failure recovery | 7 | The collapsed row says only that the call failed (`ToolPart-impl.tsx:1685`); diagnosis renders after expand (`:2068`). |
| A6 evidence after the task | 8 | The recap copies rejections, digest, and duration, and names an unknown association (`ReviewLandingBrowserEvidence.tsx:98`). |
| A7 pause and take over | 8 | Pause waits 500 ms and reports stopped or still finishing (`native-webmcp.js:10`); a lost host renderer pauses the live page (`desktop-webmcp-browser.js:1090`). |
| A8 several sessions | 8 | Each session keeps its page, a hidden call shows waiting, and revoke is per session (`WebMcpPages.tsx:123`); owner loss keeps the page for the next window (`desktop-webmcp-browser.js:520`). |
| B1 see registered tools | 8 | Kind, hints, schema, and a named rejection sit in the same collapsed catalog (`WebMcpToolPanel.tsx:711`). |
| B2 try and compare | 8 | A truncated manual input is stored empty and export refuses it (`useWebMcpBrowserStore.ts:579`); JSON drafts mask when the redactor would change them (`WebMcpToolPanel.tsx:504`). |
| B3 iterate | 8 | The journal records truncation (`useWebMcpBrowserStore.ts:579`); the property diff is one JSON blob (`WebMcpToolPanel.tsx:982`). |
| B4 diagnose misuse | 8 | Diagnosis names every primitive property (`webMcpToolForm.ts:90`) and labels a truncated call (`webMcpDiagnosis.ts:235`); a call without a receipt is missing input (`toolHelpers.ts:400`). |
| B5 onboarding docs | 8 | The guide records the 2 KiB preview, memory-only receipts, and pair redaction (`docs/webmcp-page-tools.md:308`). |

**Means:** A **8.00** (64/8). B **8.00** (40/5).

**Versus round 24** (this ballot at `5193b0c8`): every step holds. `185e35f6` and `a1d05f68` close inherited-sensitivity and diagnostic-pair holes and unify structured field masking. The collapsed failure row, the JSON diff, receipt-only diagnosis, and the guide's pair-level redaction section are unchanged.

**Three changes that lift the lowest steps most:**

1. Show the persisted error on the collapsed row and the strip, and when `webMcpRuntimeRejections` has a property, show that property and rule (`ToolPart-impl.tsx:1685`). That lifts **A5** and **A3**.
2. When no approval receipt exists, diagnose the tool-call input already on the part. `readWebMcpInvokeInput` returns missing unless `metadata.arguments`, `metadata.input`, or `inputPreview` is present (`toolHelpers.ts:400`). That lifts **B4** and rejected-call **B2**.
3. Render `propertyDiff` as rows (`WebMcpToolPanel.tsx:982`), and make `webMcpResultPreview` say when it keeps only 64 fields (`toolHelpers.ts:328`). That lifts **B3** and the result side of **A6**.
