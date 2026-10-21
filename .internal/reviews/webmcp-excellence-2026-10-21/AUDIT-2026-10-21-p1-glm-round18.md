All residual files are now verified. The audit is complete — here is the full, final result.

# WebMCP P1 Audit — Final Result

**Verdict: no P1.** Two P2 findings. Full scope now read; no unverified residuals remain.

## Coverage (complete)

Electron: `desktop-webmcp-browser.js` (1541 ln), `native-webmcp.js`, `webmcp-manual-outcome.cjs`, `webmcp-redaction.mjs`, `browser-eviction.js`. UI: `EmbeddedWebMcpBrowser.tsx`, `useWebMcpBrowserStore.ts`, `WebMcpPages.tsx` (+`useWebMcpPages.ts`), `WebMcpToolPanel.tsx` (full, 1111 ln), `WebMcpToolPanelConnected.tsx`, `WebMcpCallStrip.tsx`, `WebMcpCancellationStatus.tsx`, `WebMcpBuilderHint.tsx`, `WebMcpBrowserTools.tsx`, `McpDropdown.tsx`, `PermissionCard.tsx`, `WebMcpApprovalToolInfo.tsx`, `ReviewLandingBrowserEvidence.tsx`, `toolHelpers.ts`, `webMcpCalls.ts`, `webMcpDiagnosis.ts`, `webMcpCatalog.ts`, `webMcpPropertyDiff.ts`, `revealToolPart.ts`, `useWebMcpCloseConfirmation.tsx`, `useWebMcpApprovalOutcome.ts`, `SessionGrid.tsx` (wiring), `sessionGridPopout.ts`. Scripts/docs: `webmcp-check.mjs`, `-lib.mjs`, `-entry.cjs`, `-receipt.cjs`, `docs/webmcp-page-tools.md`.

## Round-18 fixes — all verified

- **inputPreview + definitionDigest on approval cards**: `PermissionCard.tsx:401-407`; digest-gated tool info (`WebMcpApprovalToolInfo.tsx:52`, else explicit "may differ"); preview consumed redacted/capped with receipt marker preserved (`toolHelpers.ts:474-485`).
- **Approval expiry**: disappeared approvals record "unanswered"; call strip and transcript show "no answer recorded" and never infer timeout/rollback. No path grants an expired approval.
- **Full descriptions** to 4096 with collapsed summary (`WebMcpApprovalToolInfo.tsx:91-98`).
- **Property-level schema diffs, bounded history**: 32-event cap; diffs cover type/required/enum/description (`webMcpPropertyDiff.ts:11-12`); rendered redacted (`WebMcpToolPanel.tsx:1034`); historical schema used for agent diagnosis when the digest is in history.
- **Opaque ids for credential-shaped tool names**: Try it dispatches `invocationID ?? name` with origin/generation/definitionDigest binding (`WebMcpToolPanel.tsx:698,1094`), validated digest-side in main (`desktop-webmcp-browser.js:1400-1412`).

## Prior-round fixes re-verified (hold)

Redaction vocabulary (arrays, nested/embedded JSON, key-value, signed URLs/OAuth `code|state`, separator-normalized names, fail-closed decoders); origin-only address history, scrubbed on read; one-reprompt close confirmation bound to view/webContents identities, "Close anyway" only at shutdown; eviction honors `canDiscardDocument`/sticky unsaved-work with 250 ms probe bounds and conservative retention; sign-in popups human-only and block agent calls while open; request identity checks (provider/epoch/project/session); cancel summaries truthful (stopped vs still-finishing); pool-full surfacing; checker exit codes 0/1/2/3/64 (missing expected tools → 1 even with an empty catalog), watchdog kills the tree before profile removal, contaminated runs not run, HMAC-keyed receipts across the disk boundary, report redacted at write and read; pop-out single ownership enforced in main (`lookup` sender check, `owned-by-another-window` + disclosed `focusOwner`); all in-memory caps enforced in the store.

## P2 findings

1. **[P2] Dotted WebMCP permission names bypass the redacted approval branch.** `PermissionCard.tsx:204` treats names ending `.webmcp` as desktop-WebMCP for scope labeling, but `isWebMcp` (line 71) and the render branch (line 381) match only `webmcp`/`desktop_webmcp`. Such a card falls into the generic branch (lines 487-513) and dumps `JSON.stringify(permission.metadata)` **unredacted** — raw `arguments`, `text`, origin — skipping the effect sentence and input summary. Repro: a runtime emitting permission name `desktop.webmcp` with a credential-shaped argument. Impact: secret on screen; latent only (current runtimes send the underscored forms; tests confirm). Fix: use one shared predicate for all three checks.

2. **[P2] Catalog `inputSchema` crosses main→renderer unredacted** (`desktop-webmcp-browser.js:69`). Mitigated by the 32 KiB/definition bound and redaction at every display site verified this pass (SchemaBlock, FieldInput, propertyDiff, schemaInputs, ToolCompare); the guarantee relies on per-site discipline rather than a boundary projection. A future raw render of schema strings would leak page-authored text. Fix: bound string lengths in the projection, as `webMcpDisplaySchema` does.

## Notes

- Docs cross-check: every code-verifiable claim in `webmcp-page-tools.md` matches (caps, exit codes, probe bounds, confirmation semantics, replay fill-not-run, `<fill in>` journal placeholders, enum-by-index submission). The "v7.28.2 runtime sends a masked preview" statement is a runtime pin claim, unverifiable in this repo — not a contradiction.
- Try-it outcome classification is truthful: transport-completed results carrying error envelopes display as failures; IPC loss yields "uncertain" with no auto-retry; journal recording is guarded by origin/browserId identity.
- Subagent fan-out was unavailable this session (`ProviderModelNotFoundError`); all files were read directly instead — coverage is complete regardless.