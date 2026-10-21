## Round 14 judgment at HEAD (read-only; no files modified)

Verified in source, not from the README. Uncommitted `config/`, `pnpm-lock.yaml`, version pins ignored. ADR-266 fields (`inputPreview`, `arguments`, `definitionDigest`, correlation ids) get **no credit**.

| Step | R13→R14 | Score | Judgment + path:line |
|---|---|---:|---|
| A1 discover | 8→8 | **8** | Raw schemas, badges, truncation, named rejections and a registration timeline are readable before any grant; unchanged by R14 (`WebMcpToolPanel.tsx:901`). |
| A2 enable/scope trust | 7→8 | **8** | R14a adds per-session revoke, one display-only trust surface and interrupted-access state (`WebMcpPages.tsx:117`, `WebMcpPages.tsx:149`), but sign-in popups stay denied (`desktop-webmcp-browser.js:727`) and there is no schema-bound saved grant — the card itself says no standing grant exists (`PermissionCard.tsx:196`). |
| A3 watch live | 7→7 | **7** | Duration, preview, failure reason and generation marker are real (`WebMcpCallStrip.tsx:80`, `:84`), but a row navigates to a *message*, not the call, and there is no approval link (`WebMcpCallStrip.tsx:53`). |
| A4 approvals | 7→7 | **7** | Call-derived effect and explicit one-call scope are sound (`PermissionCard.tsx:446`, `:461`), but masked arguments degrade to "runtime did not provide" and the 20s bound is a local send timeout, not an approval-expiry outcome (`PermissionCard.tsx:79`). |
| A5 failure recovery | 7→8 | **8** | R14a closes the round-13 P2: the provider poll is now bounded and half-open runtimes surface as `interrupted` instead of stalling silently (`desktop-webmcp-browser.js:118`, `:547`, `:570`). |
| A6 evidence | 7→7 | **7** | Recap lists the latest turn's steps and never-called tools (`ReviewLandingBrowserEvidence.tsx:64`, `:108`) but is capped at 50 calls inside a 200-message window with no receipts or export. |
| A7 pause/take over | 7→7 | **7** | Pause/resume/disconnect are separate and `stoppedCalls` is surfaced (`EmbeddedWebMcpBrowser.tsx:338`, `:354`), but cancellation is checkpoint-only because `executeJavaScript` cannot be aborted mid-script (`native-webmcp.js:98`). |
| A8 several sessions | 6→8 | **8** | Switcher names project/session/origin/access with per-row revoke (`WebMcpPages.tsx:97`, `:113`), waiting reaches Needs you, Mission Control and the grid (`NeedsYouPopover.tsx:121`, `MissionControlRow.tsx:253`), W7 proves cookie isolation and independent revoke (`project-browser-sessions.mjs:98`, `:143`) — but the LRU only evicts same-window entries and still dead-ends on `pool-full` (`desktop-webmcp-browser.js:698`, `:700`). |
| B1 see registered tools | 8→8 | **8** | Complete, unchanged (`WebMcpToolPanel.tsx:582`). |
| B2 try and compare | 6→8 | **8** | Bounded 32-entry journal, editable replay and regression export are real (`useWebMcpBrowserStore.ts:107`, `WebMcpToolPanel.tsx:981`, `webMcpDiagnosis.ts:121`), but the agent half of the compare needs runtime arguments and otherwise shows "nothing is guessed" (`WebMcpToolPanel.tsx:251`). |
| B3 iterate | 8→8 | **8** | Drafts keyed by definition, named rejections, stale marks; unchanged. |
| B4 diagnose misuse | 6→8 | **8** | `diagnoseWebMcpInput` names property, rule and value kind for both manual and agent inputs (`webMcpDiagnosis.ts:51`, `WebMcpToolPanel.tsx:186`), honestly advisory (`:240`) — but agent diagnosis is inert without runtime arguments (`toolHelpers.ts:420`). |
| B5 onboarding | 8→8 | **8** | Six-section guide plus runnable example, now covering several sessions and testing (`docs/webmcp-page-tools.md:109`, `:153`); unchanged. |

**Means: A = 7.50, B = 8.00** (R13: A 7.00, B 7.00).

**Moved (codex R13→R14):** A2 7→8, A5 7→8, A8 6→8, B2 6→8, B4 6→8. **Unchanged:** A1, A3, A4, A6, A7, B1, B3, B5. On my ballot the four R13 failures all reach 8; A3/A4/A6/A7 remain below the bar, so this ballot alone establishes no passage.

**Three changes, aimed at the lowest steps:**
1. **Pin a signed runtime carrying ADR-266** (`arguments`/`inputPreview`, `definitionDigest`, correlation ids). One change unblocks four: masked approval arguments (A4), strip rows that open the exact call (A3), recap bound to the catalog the call actually ran against (A6), and the agent side of compare/diagnose (B2/B4).
2. **Make cancellation really abortable.** Replace checkpoint-only cancellation with an abortable page-operation channel and await the runtime's cancel acknowledgement before reporting a pause as effective (`native-webmcp.js:98`, `:148`) — the only honest route to A7.
3. **Remove capacity dead-ends.** Unload on hide rather than only when creation hits the bound, and allow LRU eviction across windows so `pool-full` is never terminal (`desktop-webmcp-browser.js:698`).