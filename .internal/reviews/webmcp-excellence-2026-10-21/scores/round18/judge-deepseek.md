Read-only review. I read the round-18 tree at HEAD `7811c298` (`92775899` in the brief is the round-15 pin), including the three-platform job at `desktop-ci.yml:319-320`; W4's expiry is still stub-scripted (`project-browser-tasks.mjs:182-185`), so I credit the UI behavior, not runtime-timer qualification.

| Step | R17 | Score | One-sentence judgment |
|---|---:|---:|---|
| **A1 Discover** | 8 | **8** | Full descriptions, raw schemas, hint badges, origin, catalog caps and advisory lint are inspectable before any grant, but discovery still starts from a dense collapsed technical panel (`WebMcpToolPanel.tsx:740-764`, `:1089-1106`). |
| **A2 Enable and scope trust** | 8–9 | **9** | Session-scoped enable, per-session revoke, the isolated-profile sign-in wait and an explicit Sign out make trust legible and revocable, though there is still no read-only saved-grant list (`WebMcpPages.tsx:25-45`, `EmbeddedWebMcpBrowser.tsx:485`). |
| **A3 Watch live** | 8–9 | **8** | Rows carry outcome, duration, argument and result previews, failure reason, earlier-page marker and a link to a pending approval, but evidence is still bound by call ID rather than the runtime's correlation id (`WebMcpCallStrip.tsx:107-136`). |
| **A4 Approvals** | 7 | **9** | The card now renders the runtime's redacted `inputPreview` with its own truncation marker, shows the page definition only on a `definitionDigest` match with the full description expandable, and turns a vanished request into an explicit unanswered outcome (`PermissionCard.tsx:401-475`, `WebMcpApprovalToolInfo.tsx:52-97`, `en.ts:2731`). |
| **A5 Failure recovery** | 8 | **8** | Transport success, application error, timeout, cancellation, uncertain completion and stale form remain distinct with one vocabulary, but a runtime-side rejection still arrives without a mapped property explanation (`WebMcpToolPanel.tsx:698-720`). |
| **A6 Evidence after the task** | 8–9 | **8** | The landing recap lists each step with duration, result, definition and changed-since flag, names never-called tools and copies the whole turn, but evidence remains clipboard text with no export artifact (`ReviewLandingBrowserEvidence.tsx:93-118`, `:198-210`). |
| **A7 Pause and take over** | 8–9 | **8** | Pause stays separate from Disconnect and reports stopped versus still-finishing from fixed metadata while keeping the page and claiming no rollback (`WebMcpCancellationStatus.tsx:7-20`). |
| **A8 Several sessions at once** | 8–9 | **8** | Pooled per-session pages, LRU unload, independent revoke, waiting surfaces and cross-window Focus support parallel supervision, but the pool bound is main-process supplied and acting in a hidden page still needs the person (`WebMcpPages.tsx:18-45`, `:198-209`). |
| **B1 See registered tools** | 8 | **8** | Schemas, annotations, registration history and named rejections are visible before any grant, but nothing predicts a runtime rejection before the call (`WebMcpToolPanel.tsx:500-532`, `:1012-1038`). |
| **B2 Try by hand and compare** | 7–9 | **9** | Manual runs keep absent/empty/zero/false distinct, bind to origin+generation+digest, compare against the agent's `inputPreview`, and now invoke credential-shaped names through the opaque invocation id (`WebMcpToolPanel.tsx:698`, `desktop-webmcp-browser.js:1401`). |
| **B3 Iterate** | 7–8 | **8** | The timeline keeps 32 events with their definitions and shows property-level added/removed/changed rows with type, required, enum and description fields while retaining drafts and stale marks (`webMcpCatalog.ts:260-311`, `WebMcpToolPanel.tsx:1033-1035`). |
| **B4 Diagnose misuse** | 7–8 | **8** | Diagnosis names property, rule and value kind, checks the digest-named historical schema when it is retained and honestly refuses a truncated preview, but remains advisory rather than the runtime validator (`WebMcpToolPanel.tsx:306-308`, `:1163-1184`). |
| **B5 Onboarding docs** | 8–9 | **9** | The guide now documents approval receipts, preview truncation, unanswered outcomes, bounded history, property diffs and opaque invocation alongside the runnable quickstart (`docs/webmcp-page-tools.md:303-319`). |

**Means:** supervisor **A 8.25**; builder **B 8.40**.

**Movement vs round 17:** substantive moves are **A4 7→9** and **B3 7→8**; **B2** rises to 9 and **B4** to 8 on this card; A2 and B5 match the best round-17 ballots; A1, A3, A5, A6, A7, A8 and B1 hold. Twelve steps now clear 8; only the remaining single-point gaps separate them from 9.

**Three changes that would raise the lowest steps most**

1. **Carry the runtime's rejection reason and validation path into the transcript** using the existing property/rule vocabulary, instead of leaving runtime failures generic — lifts **A5** and **B4** together (`WebMcpToolPanel.tsx:698-720`).
2. **Bind call rows and the recap to the runtime correlation id and add an exportable evidence artifact** containing approval, execution and cancellation outcomes, not just clipboard text — lifts **A3** and **A6**.
3. **Add per-session "act while hidden" consent and a user-visible, configurable pool bound**, so supervising several sessions does not require keeping the acting page on screen — lifts **A8**.