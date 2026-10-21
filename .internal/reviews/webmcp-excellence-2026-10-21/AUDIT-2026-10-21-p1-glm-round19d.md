# WebMCP Audit — `r19-audit` branch (final, complete scope)

**Verdict: no P1.** Every file named in the task brief plus the shared/supporting modules they call was read in full or in the relevant part. Round-18/19 fixes verified present; three minor (P3) observations, nothing at P1/P2 severity that meets the stated bar.

## Coverage

**Main/shared:** `desktop-webmcp-browser.js` (all 1492 lines), `native-webmcp.js`, `webmcp-manual-outcome.js` + `webmcp-manual-outcome.cjs`, `browser-eviction.js`, `browser-shutdown.js`, `webmcp-redaction.mjs`, `webmcp-digests.cjs`, `webmcp-catalog-projection.cjs`, `webmcp-view-key.mjs`.
**UI:** `EmbeddedWebMcpBrowser.tsx`, all of `components/mcp/*` (ToolPanel, CallStrip, Pages, CancellationStatus, BrowserTools, BuilderHint, HeaderButton), `PermissionCard.tsx`, `WebMcpApprovalToolInfo.tsx`, `ReviewLandingBrowserEvidence.tsx`, `SessionGrid.tsx` (WebMCP slot), `sessionGridPopout.ts`, `toolHelpers.ts`, `webMcpCalls.ts`, `webMcpCatalog.ts`, `webMcpDiagnosis.ts`, `webMcpToolForm.ts`, `webMcpToolLint.ts`, `webMcpPropertyDiff.ts`, `webMcpSummary.ts`, `revealToolPart.ts`, `permissionPayload.ts`, `useWebMcpBrowserStore.ts`, `useWebMcpApprovalOutcome.ts`, hooks (`useWebMcpBrowser`, `useWebMcpPages`, `useWebMcpPoolProjection`, `useWebMcpStorageEvents`, `useWebMcpTranscriptCalls`, `useWebMcpCloseConfirmation`, `useWebMcpApprovalDefinition`).
**Checker/docs:** `webmcp-check.mjs`, `-lib.mjs`, `-entry.cjs`, `-receipt.cjs`, `docs/webmcp-page-tools.md`.

## P1 categories — all clear

- **Data loss:** close/eviction paths probe `beforeunload` (250 ms bounded), sticky `possibleUnsavedWork`, post-probe idle/visibility/generation re-checks, confirmation token bound to action + page/webContents identities with the documented single re-prompt; `closeAll` serializes approvals per window, reveals refused pages, and shutdown throws `BROWSER_CLOSURE_REFUSED` before exit. Sign-out confirms across every live page and popup of the project before clearing storage.
- **Wrong page/session/project:** main binds every acting command to the sender (`lookup`), revalidates session/project on mismatch, refuses `owned-by-another-window` (pop-out keeps one browser owner; `sessionGridPopout` reconciles via the native inventory), resolves the session from the authenticated runtime during enrollment, and validates peer-generated request identity (provider/epoch/project/session) per poll. `tryTool` revalidates origin + generation + definition digest + opaque tool id server-side.
- **Credential leaks:** redaction is applied at every display/log/persistence boundary reviewed (status, catalog, rejection, titles, approval metadata fallback, journals, recaps, exports use `<fill in>` placeholders, checker reports keyed HMAC receipts so redacted values can never satisfy an identity check); drafts/runs/journal are memory-only; address history stores origins only and scrubs on read; sensitive form fields are masked with autocomplete off; JSON editor masks by default.
- **False claims:** transport completion is never reported as tool success (`manualToolResult`/`desktopWebMcpResultOutcome` parity, including `uncertain` on IPC loss with no auto-retry); "never called" lists are suppressed whenever an invoke has an unresolvable identity; truncated previews are labelled and excluded from diagnosis; pause/disconnect report stopped vs still-finishing per request.
- **Hangs/unusable panes:** every await has a deadline (loads, polls 20 s, replies 2 s, eviction probes, permission reply 20 s with retry, enable attach-wait); failed loads keep the pane usable; three failed status polls surface `disconnected` with a recovery action.
- **Documented flows:** exit codes, receipts, contamination-after-unconfirmed-timeout, replay semantics, and eviction/prompts in `docs/webmcp-page-tools.md` all match the implementation.

## P3 observations (below the P1 bar; record only)

1. `desktop-webmcp-browser.js:814-830` — a popup opening in the race between the idle re-check and `close(entry)` inside `unload()` makes `closeForEviction` throw, aborting the entire `createView` ("Browser page refused closure") instead of trying the next eviction candidate. Recoverable on retry; no data lost. Suggest a per-candidate try/catch.
2. `useWebMcpApprovalOutcome.ts:18-23` — when the runtime self-answers an `autoOnceAt` approval at expiry, the strip says "No answer recorded". True of the user, and the docs disclaim inference, but it could be misread as "call unapproved" while the call ran; the transcript outcome is still shown.
3. `useWebMcpApprovalDefinition.ts:6-10` — approval hints resolve from the live catalog only (unlike `ToolCompare`, which also searches registration history). Fail-closed ("definition may differ"), so safe, merely less informative.

## Conclusion

For PRD definition-of-done item 3 ("no P1 finding in an audit run after the last round"): **no P1 found** in the audited source.