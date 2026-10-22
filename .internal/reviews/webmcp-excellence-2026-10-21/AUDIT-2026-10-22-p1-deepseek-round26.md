# WebMCP audit — HEAD `96f74a34` — final result

**Verdict: no P1** in the surface this audit covers. Four findings, one MEDIUM security, three LOW; recorded as `c68f21a65c2393fc`, `52fba92fdea3ca8c`, `4ae7e7fc9e75b512`, `91c434ca13c52db3` (review `8042d24822c72a4d`, decision request_changes).

## Evidence actually executed

Unlike my interim note, this pass ran checks: `vitest` for `desktop-webmcp-browser.test.mjs` + `native-webmcp.test.mjs`, and `webMcpCalls` / `webMcpDiagnosis` / `webMcpCatalog` — **all pass** (envelope `d724874e4a1cd099`). Two probes against the shared redactor pinned the one security finding empirically: `redactWebMcpReport({error:{field:"password",message:"hunter2 must be at least 8 characters"}})` **retains `hunter2`** (`4a56de960a490853`), while the same secret under `{value, field:"password"}` is redacted (`993c20f25d393cea`) — so the probe distinguishes the shapes rather than failing blind.

## Why no P1

Read end-to-end this round: `desktop-webmcp-browser.js` (1597 lines), `native-webmcp.js`, `webmcp-page.js`, `browser-eviction.js`, `webmcp-catalog-projection.cjs`, `webMcpCatalog/Diagnosis/Calls/FailureSummary/ToolForm/PropertyDiff`, `toolHelpers.ts`, `WebMcpToolPanel(.Connected)`, `WebMcpPages`, `WebMcpCallStrip`, `WebMcpCallDiagnosis`, `PermissionCard`, `EmbeddedWebMcpBrowser`, `SessionGrid`, `sessionGridPopout`, the approval stores/hooks, `docs/webmcp-page-tools.md`, and `webmcp-check.mjs`.

- **Wrong page/session/project:** `createView` rejects a second owner (`:914-921`); `tryTool` and `execute` require current origin, generation, frame and exact `definitionDigest` (`:1474-1483`, `native-webmcp.js:340-364`); provider requests are identity-checked (`:883-891`); `tryTool` uses an opaque main-issued id, so a credential-shaped tool name never has to be sent.
- **Without approval / silent widening:** `authorizeClose` binds token, action and webContents identity with one re-prompt (`:373-404`); `confirmAndClose` re-validates ownership after every await; `acceptTools` retires before validating, so a rejected batch cannot stay authorized.
- **False success / false rollback:** outcome classification is consistent across `manualToolResult`, `desktopWebMcpResultOutcome` and `collectWebMcpCalls`; exports are refused for timeout/cancel/uncertain; a dropped Try-it result is never presented as success (`WebMcpToolPanel.tsx:645-655`).
- **Lost work:** eviction is conservatively sticky (`canDiscardDocument` returns false on any inconclusive probe, 250 ms bounds), `closeForEviction` never detaches before Chromium confirms, and quit/restart/update go through `closeAll` → per-sender serialized `confirmAndClose` with `refused` propagated as `BROWSER_CLOSURE_REFUSED`.
- **Hang:** every wait is deadline-bounded (visibility, polls, reply POSTs, attach, load); one automatic operation is retained per adapter; `poolOperations` is serialized and re-checked after the queue.
- **Pop-out keeps one owner:** the grid pane renders only a compact switcher (`SessionGrid.tsx:289`), never a second view; the pop-out receives `owned-by-another-window` plus a focus handle.
- Round-26 items are present in source: collapsed-row failure reason, waiting-page chip (`webMcpPageNeedsYou` wired to Needs you, Mission Control, grid), compact page access.

## P2s (brief)

1. **`c68f21a65c2393fc` — MEDIUM, `shared/webmcp-redaction.mjs:168-171`.** When a sibling `field`/`path` names a sensitive property, a value carried in `text`/`message`/`reason` is not redacted. Repro: page returns `{error:{field:"password",message:"hunter2 must be at least 8 characters"}}`; the transcript, call strip and recap render `hunter2` (`webMcpDiagnosis.ts:210-215`). Impact: page-influenced secret on screen. Fix: honour `sensitiveField` for string values whose key is not a naming key.
2. **`52fba92fdea3ca8c` — LOW, `components/mcp/WebMcpCallDiagnosis.tsx:91`.** `currentDigest` is the call's own digest, so the "definition changed" note can never appear in the transcript or recap, though the builder panel shows it and `docs/webmcp-page-tools.md:77-78` promises it.
3. **`4ae7e7fc9e75b512` — LOW, `hooks/useWebMcpCloseConfirmation.tsx:20-25`.** A third `confirmationRequired` (single-use token superseded by a concurrent approval for the same window) is returned as `null` and read as "user cancelled"; `WebMcpPages.tsx:40` then shows nothing.
4. **`91c434ca13c52db3` — LOW, `components/views/git/ReviewLandingBrowserEvidence.tsx:46-65`.** Whole-turn `collectWebMcpCalls(∞, ∞)` plus `JSON.stringify`/`parse` inside a store selector runs on every part update; long turns pay it per streamed token.

## Residual gaps

Not executed: `pnpm run webmcp:check` (needs the bundled engine/display) and the WebMCP e2e harness, so exit-code behaviour and rendered UI rest on source plus their unit tests. `PermissionCardTools` (presentation mapping) and the e2e scripts were not read. Uncommitted `config/`, lockfile and version pins were ignored as instructed.