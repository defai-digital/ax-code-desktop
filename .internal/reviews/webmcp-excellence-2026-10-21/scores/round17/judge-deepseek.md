No remaining work: this was a read-only judgment, nothing was modified, and the scorecard is complete.

## Round 17 judgment — deepseek-flash, source read at HEAD `7f63b436` (read-only)

| Step | Score | One-sentence judgment |
|---|---|---|
| A1 discover | **8** | Full descriptions, raw schema with a visible 32 KB truncation note, hint badges, origin, rejected-catalog naming and advisory lint — but all inside the pane's collapsed panel (`WebMcpToolPanel.tsx:972-1098`, `:489-524`). |
| A2 enable and scope trust | **9** | Enable/Pause/Disconnect, per-session revoke, a trust summary, an explicit Sign out that clears project storage, origin-only saved history, and sign-in popups that hold the agent — only a read-only grant list is still prose (`EmbeddedWebMcpBrowser.tsx:476-486`, `WebMcpPages.tsx:157-174`, `useWebMcpBrowserStore.ts:419-424`, `desktop-webmcp-browser.js:947-980`). |
| A3 watch live | **9** | Rows carry outcome, duration, result preview, earlier-page marker, failure reason, open the exact tool part with highlight, and link a running call's approval (`WebMcpCallStrip.tsx:60-133`). |
| A4 approvals | **8** | Effect sentence from call data, "this call only" scope, required inputs and hints labelled as the page's claim and never as approval — but no approval-expiry outcome is ever rendered and the page description is cut at 200 characters (`PermissionCard.tsx:378-482`, `WebMcpApprovalToolInfo.tsx:92-98`). |
| A5 failure recovery | **8** | Transport success, application error, timeout, cancellation, uncertain completion, stale-form and provider-gone are distinct with one shared vocabulary; the runtime's own rejection still arrives without an explanation (`en.ts:2743-2746`, `WebMcpToolPanel.tsx:698-712`). |
| A6 evidence after the task | **9** | Each recap step is a button to its call with duration, result, definition digest and changed-since flag, with a shown-N-of-M note and a copy covering the whole turn including never-called tools (`ReviewLandingBrowserEvidence.tsx:93-124`, `:198-210`). |
| A7 pause and take over | **9** | Pause awaits a bounded acknowledgement, reports stopped versus still-finishing, keeps the document, names the owning window, and the interrupt is gated on the executing script and its document so the post-click delay can no longer be killed (`native-webmcp.js:509-524`, `desktop-webmcp-browser.js:339-356`, `WebMcpCancellationStatus.tsx:7-20`). |
| A8 several sessions | **9** | Pooled pages per session with LRU unload, independent revoke, waiting surfaces in the switcher and Needs you, cross-window ownership with Focus, and unsaved-work protection on eviction, close, sign-out, quit, restart and update (`WebMcpPages.tsx:14-155`, `browser-eviction.js:5-68`, `main.js:1159-1161`, `:1231`). |
| B1 see registered tools | **8** | Raw schema, lint findings, registration timeline, named rejections and truncation are visible before any grant; nothing predicts a runtime rejection before the call (`WebMcpToolPanel.tsx:982-1028`). |
| B2 try and compare | **9** | Absent/empty/zero/false stay distinct, secret-named and JSON inputs are masked with an explicit reveal, Try it is bound to the displayed generation and definition digest with a named stale outcome, and side-by-side compare plus export exclude non-reproducible outcomes (`WebMcpToolPanel.tsx:380-433`, `:621-716`, `:291-377`). |
| B3 iterate | **8** | Timeline with digest and previous digest, stale results, drafts and journal kept across reload, retired replaced definitions; no property-level schema diff and no automatic re-registration check (`WebMcpToolPanel.tsx:1009-1028`). |
| B4 diagnose misuse | **8** | Diagnosis names property, rule and value kind for manual and agent calls, flags a definition change, refuses redacted input, exports a test; still advisory rather than the runtime's validator (`WebMcpToolPanel.tsx:186-264`). |
| B5 onboarding docs | **9** | Quickstart, journal, replay, export, pooled pages, pause and a dedicated sign-in/sign-out section with real content (`docs/webmcp-page-tools.md:250`). |

**Means:** supervisor **A = 8.6** (69/8); builder **B = 8.4** (42/5).

**Moved vs round 15 (my card):** A2 8→9 (Sign out, origin-only history, sign-in waiting) and A7 8→9 (interrupt no longer fires in the post-click delay; unfinished scripts stay discoverable). A5 and B4 held at 8 — rounds 16–17 hardened redaction and receipts, not the missing runtime explanation. A4 held at 8 because expiry is still not an outcome.

**Three changes that raise the lowest steps most**
1. **Render approval expiry as an outcome and stop truncating the page's description to 200 characters** — the 8s are A4, A5, B1, B3, B4 and A4 is the cheapest to lift (`PermissionCard.tsx:378-482`, `WebMcpApprovalToolInfo.tsx:95`).
2. **Explain a runtime-side rejection in the transcript** using the existing diagnosis vocabulary, mapping the adapter reason to the failing property — lifts A5 and B4 together (`WebMcpToolPanel.tsx:698-712`, `native-webmcp.js:346-360`).
3. **Store the previous definition and diff its properties and constraints in the registration timeline**, reusing that set for a pre-call "the runtime will reject this" line — lifts B3 and B1 (`WebMcpToolPanel.tsx:1009-1028`).

**Caveats:** source reading only; Windows/Ubuntu W7 isolation remains unproven from source, and the two recorded P2s (a credential-shaped tool name cannot be tried; 200-character approval description) still stand at this commit.