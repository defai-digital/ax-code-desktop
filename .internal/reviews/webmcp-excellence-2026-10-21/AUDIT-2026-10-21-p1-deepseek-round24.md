## WebMCP P1 audit — `r24` (read-only, code-level)

**Verdict: no P1 found.** All previously flagged residual risks are now closed by direct reads (see "Closed this pass"). No executable verification: tools were unavailable for test runs, so severity rests on code reading.

### Closed this pass (were open risks in my checkpoint)
- **"Try it" cannot be permanently stale.** `shared/webmcp-catalog-projection.cjs:30-63` mutates the passed identity map: first sight of `[origin, name]` mints `invocationID` (`:56`), re-registers LRU (`:61-62`), and evicts only after 32 unseen catalogs or 256 entries (`:87-93`). `desktop-webmcp-browser.js:1468-1479` therefore resolves `args.toolName` against a live main-issued id; the pane's 1 s status poll keeps the map current. No P1.
- **Checker timeout cannot read as success or "no tools".** `webmcp-check-lib.mjs:100-105,121,135-143`: `timedOut` or abnormal exit adds a problem, sets `incomplete`, and forces `EXIT.failed` before the `noTools` branch. Run outcomes are classified with the same `manualToolResult` used by the desktop path (`:130`).
- **Owner recovery is wired to a trusted window.** `main.js:343-349`: `recoverOwner` returns a live window whose URL passes `isTrustedRendererNavigation`, else creates the main window — so `desktop-webmcp-browser.js:529-539` never reparents a guest page into untrusted renderer content.

### Round-24 fixes — verified
1. **Bracketed / quoted assignment redaction** — `shared/webmcp-redaction.mjs:97-110`: `auth["api.key"]` splits on `[]{}"'` and `.`, and `api[\s._-]*key` matches; JSON-Pointer `~0/~1` handled at `:106`.
2. **Inherited field sensitivity** — `:125-177`: `fieldPath`/`inheritedField` propagate through nested objects, arrays and decoded JSON; a local declaration replaces context and conflicts stay sensitive (`:159-163`); value keys masked at `:170`, direct credential names at `:171`; cycles/budget fail closed via `onTruncate`.
3. **Owner-close recovery** — `desktop-webmcp-browser.js:481-495` installs a synchronous, per-owner `close` gate (batch, no re-entrancy); `:520-540` hides, unbinds, revokes access, closes; on refusal disconnects, recovers an owner, adopts and reveals; final `.catch` swallows so no listener rejection escapes. A vetoing page keeps ownership, storage and document.
4. Spot-checked intact: cancel while waiting for visibility (`:715-729` + `:872-877`); navigation revalidated against generation/origin/frame (`:652-713`); origin-only history (`useWebMcpBrowserStore.ts:425-434`); confirmation cannot loop (`:377-404`); quit refusal (`:1548-1576` + `browser-shutdown.js:12-15`); one shown view per sender (`:244-268`).

### P2
- **Over-redaction swallows whole page-authored texts.** `webmcp-redaction.mjs:65-67` and `:72-80` replace an entire string when any `?name=value` pair or `name:` assignment matches the vocabulary. Repro: description `Review settings?session=weekly` → `WebMcpApprovalToolInfo.tsx:75-82` and the panel show `[redacted]` instead of the documented full description (`docs/webmcp-page-tools.md:40`). Fail-closed, and the effect sentence still carries the decision, so approval is not misinformed — but documentation is lost.
- **Schema check silently skips values containing `…`.** `webMcpDiagnosis.ts:75`: any `[redacted]`/`<fill in>`/`…` substring marks the property uncheckable; a real input `{"note":"loading…"}` is reported as a coverage gap.
- **Two digest vocabularies.** `toolHelpers.ts:374-384` accepts 8–64 hex; `useWebMcpBrowserStore.ts:368-369` requires exactly 64; `webMcpCatalog.ts:284-290` needs an exact native digest. Repro: runtime sends an 8-char digest → call row shows a digest badge, diagnosis says "definition no longer available".
- **Permission reply is retryable after the timeout.** `PermissionCard.tsx:91,121-127`: at 20 s the guard resets and the card is usable again; if the runtime already applied the reply, a second `once` can be sent. Needs a runtime-idempotency test rather than a patch.
- **Transient "disconnected" from the 1 s poll.** `EmbeddedWebMcpBrowser.tsx:336-349`: three missed polls (~3 s) during a slow serialized pool operation show an error whose fix is "reopen", which closes the page (prompted when risky). Confusing, not lossy.

### P3
- `native-webmcp.js:465-469,534-537`: a page handler that blocks the renderer and survives `Runtime.terminateExecution` leaves `interacting` true; later read/act/invoke fail until reload/navigate. Recovery exists (`invalidate()` → `retirePageOperation`), but the pane names no reason.
- `desktop-webmcp-browser.js:411` + `useWebMcpCloseConfirmation.tsx:21`: a title like `Settings?session=1` becomes `[redacted]` in the close list (ids still shown).
- `webmcp-check.mjs:89`: `process.exit` immediately after `console.log` can truncate piped stdout.

### Scope note for PRD item 3
This pass covers the files named in the brief plus `webmcp-catalog-projection.cjs`, `webmcp-check-lib.mjs` and `recoverOwner`. Nothing in them meets the P1 bar (lost work, wrong page/session/project, action without approval, credential exposure, false success/rollback claim, unrecoverable pane, or a broken documented flow). No test suite was executed, so treat this as a static clearance; the focused Electron/UI WebMCP suites from the round-24 receipt remain the runtime evidence.