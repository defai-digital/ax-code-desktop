# WebMCP excellence rubric baseline judgment at HEAD (7696232a)

Read from `desktop/packages/ui/src`, `desktop/packages/electron/src`, and `docs/`. Optional runtime fields (ADR-266) are not in the pinned runtime and receive no capability credit, only the shape they leave in Desktop source.

## Supervisor (A)

A1 discover — **6/10**. Page-tool panel shows name + description (truncated), `Try it` opens pre-grant, but no raw schema, no annotation badges, no truncation notice on the 64-tool / 256 KiB catalog cap, no overview distinguishing page tools from read/act. WebMcpToolPanel.tsx:108-150; useWebMcpBrowserStore.ts:155-160.

A2 enable/scope trust — **6/10**. Explicit enable/disconnect, session binding, fresh authority per pane, but URL restore strips query+hash, close wipes cookies+storage (per-window partition), popup auth not supported, no consolidated "origin + scope + grants + revoke" surface. EmbeddedWebMcpBrowser.tsx:374-400; useWebMcpBrowserStore.ts:141-152; desktop-webmcp-browser.js:138-152.

A3 watch live — **6/10**. Strip rows render tool, redacted arg preview, outcome and `failureReason`, capture `at`, but no target marker, no duration/timestamp visible, no expand-to-result, no row→transcript link, no per-page tag. WebMcpCallStrip.tsx:49-87; webMcpCalls.ts:55-85.

A4 approvals — **7/10**. Origin, toolName, operation, element kind/name and submit flag, masked/redacted text and `argumentsText` line; no derived effect sentence, no masked inputPreview row, no countdown or visible timeout outcome. PermissionCard.tsx:374-457; toolHelpers.ts:362-378.

A5 failure recovery — **6/10**. Load-error codes map to recoverable actions (`address`/`reopen`/`enable`/`reload`); `desktopWebMcpResultFailed` distinguishes completed/timeout/canceled; but manual invocation collapses everything to "tool-unavailable" or "failed" with one shared message. webMcpSummary.ts:22-193; WebMcpToolPanel.tsx:97-99.

A6 evidence — **6/10**. Per-session call scan, latest-turn counts, landing summary card with `data-landing-browser-evidence`, but no structured WebMCP recap (effects, how-each-step, never-called tools), landing click requests agent mode rather than opening the transcript part. WebMcpCallStrip.tsx; ReviewLandingBrowserEvidence.tsx:31-46.

A7 pause/take over — **6/10**. Real provider revocation + active-page-request cancel via `pause()`/`disconnect()`, Resume vs Disconnect buttons, but no explicit "Pause agent (page kept)" distinct from revoke, no cancellation-complete acknowledgment, no reachable focus on the page after pause. desktop-webmcp-browser.js:119-124; native-webmcp.js:113-122; EmbeddedWebMcpBrowser.tsx:374-400.

A8 several sessions/pages — **3/10**. One pane per `sender.id`, one shared snapshot across the panel, switching session rebuilds the pane with access off; no tabs, no concurrent ownership view, per-window storage lives in `ax-coder-webmcp-${entry.sender.id}` and is wiped on close. desktop-webmcp-browser.js:140,349; useWebMcpBrowserStore.ts:194-200.

## Builder (B)

B1 see registered tools — **4/10**. Catalog carries `name`/`description`/`inputSchema`, descriptions are 300-char truncated, but no raw-schema disclosure, no annotation badges, no truncation notice (silent 64/256 KiB cap), no `pattern`/`patternProperties` advisory lint. native-webmcp.js:123-160; WebMcpToolPanel.tsx:108-150; webMcpToolForm.ts:21.

B2 try and compare — **4/10**. `tryTool` IPC works and reaches the same `execute` path with `definitionDigest`; manual form slices at 24 properties and trims strings, no per-property constraints shown, no journal, no agent-side compare, app-error styling is correct. desktop-webmcp-browser.js:605-630; webMcpToolForm.ts:19,40; WebMcpToolPanel.tsx:93-100.

B3 iterate — **4/10**. Reload + native toolsAdded/Removed handled, `definitionDigest` lets the same tool re-register cleanly; no registration timeline / schema-diff row, invalid catalogs flip `available=false` silently, drafts do not survive reload. native-webmcp.js:128-160; desktop-webmcp-browser.js:159-173.

B4 diagnose misuse — **4/10**. Tool surface renders supplied `reason`/`nextAction` when the runtime emits them; no argument-vs-schema compare, no property-level manual error, no jump to the invoked `registerTool` source, no registration-error ladder. toolHelpers.ts:362-378; ToolPart-impl.tsx:200-224.

B5 onboarding — **7/10**. NEW since the audit: a 95-line `docs/webmcp-page-tools.md` (registration, schemas, errors, `AbortSignal` lifecycle, `toolautosubmit` warning, `pattern` ban, 6-row troubleshooting), a runnable `examples/webmcp-quickstart/index.html`, and a `WebMcpBuilderHint` linked from the pane when a page is open. Still no in-pane walkthrough and the doc opens externally. docs/webmcp-page-tools.md:1-95; WebMcpBuilderHint.tsx:13-32.

## Means

A = (6+6+6+7+6+6+6+3)/8 = **5.75**
B = (4+4+4+4+7)/5 = **4.6**

## Three changes that would raise the lowest steps most

1. **WX-02 inspectable capabilities** (raw schema disclosure, annotation badges, truncation notice, `pattern`/`patternProperties` advisory lint). Lifts B1 (4→8) and A1 (6→8) for two adjacent steps in one Desktop-only change. Touches WebMcpToolPanel.tsx, useWebMcpBrowserStore.ts:210-219, native-webmcp.js:138.

2. **WX-15 isolated multi-session browser contexts with visible ownership and independent revocation** (runtime, L). The current single-pane model is the root cause of A8's 3/10 and bleeds into A2 (no per-session trust surface) and A7 (no parallel pause). Steps from 3 to 8-9. Anchor: desktop-webmcp-browser.js:140,349.

3. **WX-04 + WX-05 registration truth + manual journal/replay** (schema-diff row, named `invalid-catalog` rejection, bounded in-memory journal, replay with editable input, last-agent compare). Lifts B3 (4→8), B2 (4→9), B4 (4→7) in one Desktop-only change and is the smallest package that closes three of the four lowest B steps at once. Anchors: native-webmcp.js:128-160, webMcpToolForm.ts:19, WebMcpToolPanel.tsx:191.