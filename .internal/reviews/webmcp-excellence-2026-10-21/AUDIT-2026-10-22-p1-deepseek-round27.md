## WebMCP audit — HEAD 1442693e (source read-only)

**Verdict: no P1.** Nothing in the reachable source lets a person lose work, tells the agent to act on the wrong page/session/project, acts without approval, leaks a credential to screen/logs/storage, claims success for a failure or a rollback, or leaves a pane hung with no recovery.

**Method / limits:** this run had no shell, so `pnpm run webmcp:check*`, Vitest and native journeys were **not** run and `main..HEAD` could not be diffed. Everything below is source evidence at HEAD. Files I did not read: `electron/scripts/webmcp-check*`, `WebMcpCallDiagnosis.tsx`, `WebMcpBrowserTools.tsx`, `WebMcpHeaderButton.tsx`, `useWebMcpStorageEvents.ts`, `webMcpPropertyDiff.ts`. This is therefore not yet a qualifying "fresh audit" for DoD item 3 until a journey run accompanies it.

### Fixes re-verified this pass (previously reported)
- **Redaction**: one entry point, filter-then-truncate (`webmcp-redaction.mjs:240-275`); result previews filter the whole string before the 140/4000 cap (`toolHelpers.ts:313-323`); copied recap inherits filtered values (`ReviewLandingBrowserEvidence.tsx:83-104`).
- **Stable identity / never-called**: `projectToolCatalog` mints and retains main-issued ids, keeps executable schema separate from display, and labels credential-shaped names (`webmcp-catalog-projection.cjs:29-95`); ambiguity is refused rather than guessed (`webMcpCatalog.ts:284-291`), so an unresolved call cannot become a "never called" claim (`ReviewLandingBrowserEvidence.tsx:74-77`).
- **Approval definition**: card resolves only a matching digest in the same session+origin (`useWebMcpApprovalDefinition.ts:5-10`); receipts are redacted, bounded, memory-only, and re-joined to completed calls (`stores/useWebMcpApprovalOutcome.ts:33-58`).
- **Close confirmation**: one-use token bound to action + view ids + webContents ids, at most one extra prompt then close-anyway (`desktop-webmcp-browser.js:373-404, 541-563`); renderer loops at most twice (`useWebMcpCloseConfirmation.tsx:20-25`); shutdown refuses instead of claiming success (`1552-1580`).
- **Pool-full path**: `unload` cannot throw where I first suspected — idle candidates have no popups and the second probe on an already-destroyed contents is a no-op (`browser-eviction.js:47-48`) — so the documented pool-full state is what actually surfaces; the renderer maps it to a list plus Reopen (`EmbeddedWebMcpBrowser.tsx:265,467-474`).
- **Runtime-pending state**: `runtimeCompatible === false` is explained in the shared status line (`webMcpSummary.ts:106-113`) rendered in the pane (`EmbeddedWebMcpBrowser.tsx:532-536`); the disabled Enable button is not a silent dead end.
- **Waiting/visibility**: hidden-by-bounds detaches the view, so `visible()` is false and calls wait (`desktop-webmcp-browser.js:244-254,1511-1538`); pause/visibility/sign-in waits are deadline-bounded (`715-795`).

### P2

**P2-1 — "No answer was recorded" can sit directly above a completed call.**
`hooks/useWebMcpApprovalOutcome.ts:10-13` records `unanswered` for any `pending` id that leaves the list without this window writing `answered`; `WebMcpCallStrip.tsx:68-70` renders it for **any** outcome.
Repro A: the runtime stamps `autoOnceAt` (honoured at `PermissionCard.tsx:153-167`) and answers the ask itself, so the card disappears without `recordWebMcpApproval(…,"answered")` → the strip shows "no answer was recorded … the request is no longer available" immediately above that call's success dot, duration and result preview.
Repro B: approve the ask in a second desktop window; the first window's next reconcile records `unanswered` for the same call.
Impact: a reviewer of the browser pane can read a completed, approved call as an action nobody approved, or as mutually contradictory evidence. Fix: derive the note from the call's own terminal state (only for still-running calls), and treat a card that the runtime itself resolved as answered.

**P2-2 — A popup closing during the close probe turns a confirmation into an error.**
`desktop-webmcp-browser.js:371-413`: documents are filtered for `isDestroyed()` at 371, then each is probed with awaits of up to 250 ms per debugger command (`browser-eviction.js:5-43`), and 411 calls `contents.getTitle?.()` unguarded.
Repro: open a page with a sign-in popup that closes itself; choose Sign out (or close the page). If the popup dies inside those awaits, `getTitle` throws on the destroyed object, `authorizeClose` rejects, and the command fails as `operation-failed` instead of showing the unsaved-work prompt.
Impact: no loss (retry works, storage is not cleared — the throw precedes the clear), but a documented confirmation flow reports a false failure. Fix: wrap the title read and skip documents that die mid-loop.

### P3
- Receipts are gated on exact `request.permission === "webmcp"` (`stores/useWebMcpApprovalOutcome.ts:34`), while `isWebMcpPermission` accepts `desktop_webmcp` and namespace-qualified names (`permissionPayload.ts:7-8`). For such a spelling the completed-call receipt is dropped (an honest evidence gap, but docs/webmcp-page-tools.md:311-313 promises retention on v7.28.2). Verify the pinned runtime's string.
- `protectWork` is sticky for the view's life (`desktop-webmcp-browser.js:1050-1054`), so after one keystroke every close and every page in a quit sequence prompts; a quit can stack N confirmations.
- A dormant page that landed on a credentialed URL cannot be restored: re-create is re-validated by `allowedUrl` (`1328`) and reports "Select a coding session and a valid browser URL", which misdescribes the cause.
- `createView`'s `finally { … show(selected) }` (`1125-1129`) can throw via `assertViewAlive` and mask the real initialization error.

No files were modified.