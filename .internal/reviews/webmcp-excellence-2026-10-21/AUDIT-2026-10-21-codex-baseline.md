# WebMCP experience source audit at acc31cad (codex, read-only, 2026-10-21)

Brief: `brief-audit.md` in this directory. Baseline for PRD-2026-10-21-webmcp-excellence-v1.

HEAD `acc31cad` provides a solid supervision foundation, but the WebMCP experience is not yet excellent—especially for developers building WebMCP-enabled apps.

Read-only source audit; no files modified or tests run. Requested records were reviewed; uncommitted round-11 changes receive no HEAD credit. Runtime 7.28.0 is pinned; ADR-266’s optional metadata consumers receive no delivered-capability credit.

Paths below are relative to `desktop/packages/ui/src/`; **Electron** means `desktop/packages/electron/src/`. Scores measure journey completeness against excellence.

| Journey | What exists, with evidence | Missing or rough | Score |
|---|---|---|---|
| **A1 Discover capabilities** | Names and descriptions appear before enabling access; shared entry points open the browser. [WebMcpToolPanel.tsx:191](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/mcp/WebMcpToolPanel.tsx:191) | No capability overview explaining page tools versus read/act. Full descriptions truncate; raw schemas are not rendered. | **7/10** |
| **A2 Enable and scope trust** | Explicit enable/disconnect, session binding, fresh authority after reopening. [EmbeddedWebMcpBrowser.tsx:126](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/layout/EmbeddedWebMcpBrowser.tsx:126) | No consolidated trust-scope summary. URL restoration strips query/hash; sign-in storage is wiped on close. Popup denial obstructs popup-based authentication. Electron `desktop-webmcp-browser.js:138,375`. | **6/10** |
| **A3 Watch live actions** | Strip shows tool, argument preview when supplied, outcome and failure reason. [WebMcpCallStrip.tsx:49](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/mcp/WebMcpCallStrip.tsx:49) | No target highlight, expandable result, timing or approval linkage. Calls are session-wide, not bound to the current page/document. Pinned runtime lacks ADR-266 previews. | **5/10** |
| **A4 Decide approvals** | Origin, operation, target, submit flag and redacted text; scoped “always” restrictions. [PermissionCard.tsx:374](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/chat/PermissionCard.tsx:374) | Invoke arguments remain unavailable on the pin. No visual target confirmation or clear explanation of the authority covering each call. | **7/10** |
| **A5 Recover from failures** | Native load causes map to consistent messages and repair actions. [webMcpSummary.ts:22](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/lib/webMcpSummary.ts:22) | Invoke failures still lack delivered structured diagnostics. Manual invocation collapses failures into generic messages; uncertain completion lacks a guided inspection workflow. | **6/10** |
| **A6 Review evidence** | Named transcript failures, expanded output, latest-turn landing counts. [ToolPart-impl.tsx:957](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/chat/message/parts/ToolPart-impl.tsx:957), [ReviewLandingBrowserEvidence.tsx:13](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/views/git/ReviewLandingBrowserEvidence.tsx:13) | No structured WebMCP recap connecting page, arguments, result and approval. Landing offers counts, not call drilldown; counts are bounded, and HEAD lacks landing in session-change scopes. | **6/10** |
| **A7 Pause/take over** | Hidden/modal views revoke access; explicit resume retains the page. [EmbeddedWebMcpBrowser.tsx:173](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/layout/EmbeddedWebMcpBrowser.tsx:173) | Disconnect substitutes for a dedicated takeover control. No clear cancellation-complete acknowledgement; native cancellation cannot undo effects already performed. | **6/10** |
| **A8 Multiple sessions/pages** | Project/session URL history and window-owned browser isolation. [useWebMcpBrowserStore.ts:185](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/stores/useWebMcpBrowserStore.ts:185) | Switching sessions recreates the browser and loses login/live state. One view per window and one shared snapshot; no page tabs or concurrent browser-session overview. Electron `desktop-webmcp-browser.js:349`. | **3/10** |
| **B1 Inspect registrations** | Native catalog captures schemas and registration/removal events. Electron [native-webmcp.js:123](/Users/akiralam/code/ax-code-desktop/desktop/packages/electron/src/native-webmcp.js:123). | UI exposes derived fields, not raw schemas or validation diagnostics. No warning for ADR-266-rejected `pattern`/`patternProperties`. Invalid catalogs can become generic disconnections. | **3/10** |
| **B2 Try and compare** | Manual invocation needs no agent grant and adds no transcript part. Electron [desktop-webmcp-browser.js:605](/Users/akiralam/code/ax-code-desktop/desktop/packages/electron/src/desktop-webmcp-browser.js:605). | No saved manual history or agent comparison. Form omits properties after 24, trims string values, ignores constraints; application-error output can receive success styling. | **4/10** |
| **B3 Iterate registrations** | Reload and native tool add/remove handling; stale definitions are guarded. Electron `native-webmcp.js:109,159,202`. | No registration timeline/schema diff. Name-keyed tool state can retain stale results after same-name replacement; removing tools loses drafts. | **4/10** |
| **B4 Diagnose misuse** | Transcript supports supplied reasons and next steps. [toolHelpers.ts:348](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/lib/toolHelpers.ts:348) | Pin lacks that metadata. No argument-versus-schema comparison, property-level errors, description diagnostics or linkage to the exact invoked definition. | **3/10** |
| **B5 Authoring onboarding** | Detailed Desktop UI automation guide. [development-webmcp.md:3](/Users/akiralam/code/ax-code-desktop/docs/development-webmcp.md:3) | Explicitly a separate surface. No project-app quickstart covering registration, schemas, descriptions, lifecycle, errors and agent testing. | **2/10** |

Accessibility has useful labels, disclosures and restrained live announcements (`WebMcpCallStrip.tsx:44`). However, mode-tab arrows change selection without moving focus, and native-view keyboard/screen-reader transitions remain unqualified.

All **14 locales** have recorded key coverage; that does not establish translation quality or layout usability. Long tool descriptions and microtext need localized review.

macOS, Windows and Ubuntu have native smoke/supervision coverage; Linux uses Xvfb, and supervision journeys remain advisory ([desktop-ci.yml:260](/Users/akiralam/code/ax-code-desktop/.github/workflows/desktop-ci.yml:260)). These checks do not establish complete signed-in, real-agent website journeys across platforms.

Performance is deliberately bounded: 60-message scans, 20 displayed calls, 64 catalog entries. However, one-second polling transfers the catalog repeatedly; catalog truncation is silent, and full-body mutation observation plus repeated call scans need profiling.

The twelve highest-value changes, ranked by estimated benefit/effort; effort is relative:

1. **[B · Desktop-only · Small]** Publish an app-author quickstart with a runnable example and troubleshooting checklist.
2. **[B · Desktop-only · Small]** Add raw-schema inspection and explicit warnings for runtime-rejected schema keywords.
3. **[B · Desktop-only · Small]** Fix manual forms: preserve strings, expose every property, label unsupported constraints.
4. **[B · Desktop-only · Small]** Distinguish transport success from tool/application failure; retain useful manual diagnostics.
5. **[A/B · Needs runtime · Medium]** Qualify and pin ADR-266, reconcile reason codes, expose capability availability.
6. **[A · Desktop-only · Medium]** Add expandable strip results and transcript links; clearly label session-wide history.
7. **[B · Desktop-only · Medium]** Show registration changes, schema diffs and rejected-catalog explanations.
8. **[B · Needs runtime · Medium]** Compare manual and agent calls against the exact invoked schema version.
9. **[A · Desktop-only · Medium]** Add explicit takeover/resume with cancellation feedback and accessible focus transfer.
10. **[B · Desktop-only · Medium]** Preserve invocation drafts across reloads; invalidate results when definitions change.
11. **[A · Desktop-only · Medium]** Offer explicit sign-in persistence with isolated profiles and clear sign-out.
12. **[A · Needs runtime · Large]** Support concurrent isolated browser sessions/pages with visible ownership and independent controls.

