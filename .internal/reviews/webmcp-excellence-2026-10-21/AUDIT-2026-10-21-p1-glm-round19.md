All remaining scope is now reviewed. Final consolidated audit result:

# WebMCP Audit (round 19) — Final Report

**Scope fully reviewed**: `desktop-webmcp-browser.js`, `native-webmcp.js`, `webmcp-page.js`, `browser-eviction.js`, `webmcp-manual-outcome.cjs`, `webmcp-redaction.mjs`, `webmcp-digests.cjs`, `webmcp-view-key.mjs`, `EmbeddedWebMcpBrowser.tsx` (dispatch paths), `WebMcpToolPanel.tsx` (form/tryTool/journal), `WebMcpToolPanelConnected.tsx`, `WebMcpCallStrip.tsx`, `WebMcpPages.tsx`, `WebMcpApprovalToolInfo.tsx`, `PermissionCard.tsx`, `useWebMcpApprovalOutcome.ts`, `useWebMcpCloseConfirmation.tsx`, `toolHelpers.ts`, `webMcpCatalog.ts`, `webMcpCalls.ts`, `webMcpDiagnosis.ts`, `useWebMcpBrowserStore.ts`, `permissionPayload.ts`, `sessionGridPopout.ts`, `SessionGrid.tsx` (browser-ownership paths), `revealToolPart.ts`, `ReviewLandingBrowserEvidence.tsx`, `docs/webmcp-page-tools.md`, and all four `webmcp-check*` scripts.

## Verdict: no P1

Prior-round fixes verified in source:

- **Identity binding**: agent requests re-checked for providerID/epoch/projectID/sessionID (`desktop-webmcp-browser.js:824-832`); queued navigations revalidate generation/origin/frameId immediately before loading (`:604-613`); `agentOrigin` allows https or loopback http only, no URL credentials; enable resolves the session from the authenticated runtime and cross-checks directory/projectID (`:1349-1359`); one browser owner per project/session with sender-bound lookups and bounded owner disclosure; popped grid slots drop their in-grid page entry (`SessionGrid.tsx:288`).
- **Approvals**: desktop provider offers no standing "Always allow" without a named scope; approval cards match tools by definitionDigest with a fail-safe "may differ" note; effect sentences come from call data, never page descriptions; unanswered-approval receipts expire only from accepted runtime snapshots and never infer a timeout/rollback.
- **Manual evidence (r19)**: `tryTool` requires live origin+generation+definitionDigest (`:1404-1416`), resolves by digest first, returns `stale-form` on change; the journal records invocationID+definitionDigest, validated 64-hex; manual regression export is bound via `webMcpEvidenceMatchesTool` and refuses credential-shaped names.
- **Unsaved work**: sticky interaction flags, 250 ms bounded discard probes, `closeForEviction` honoring beforeunload, one-use close-confirmation tokens bound to window+action+view/webContents identities with at most one reprompt, bounded 2-attempt UI loop, `closeAll`/quit refusing to close and revealing the page.
- **Redaction**: shared module covers nested/embedded JSON, key-value text, URL credentials, `code`/`state`, signed-URL params, spaced/normalized names, and fails closed at depth 31; applied at every display/log/persistence site I traced (status fields, close-confirmation titles, panel names/descriptions/schemas, address-bar masking, origin-only history with read-back scrub, `<fill in>` journal/export placeholders, checker reports written and re-read through `redactWebMcpReport`).
- **Liveness**: all runtime HTTP calls deadline-bounded (2 s replies/DELETE, 20 s polls with bounded retry); load timeout keeps the pane usable; permission replies are double-submit-guarded with 20 s timeout and user-visible retry; checker watchdog kills the whole process tree and removes the temp profile.
- **Checker (r18/r19 items)**: exit codes 0/1/2/3/64; expected-tool and requested-run checks compare original identities via per-check keyed HMAC receipts before redaction, so `[redacted]` collisions cannot satisfy each other; an unconfirmed timeout contaminates all remaining runs (not run) and the check fails.
- **Docs**: the flows documented in `docs/webmcp-page-tools.md` (visibility waits, eviction conditions, confirmation semantics, sign-in popups, opaque manual selectors, checker behavior) match the implementations read.

## P2

**[P2] Landing recap can name a called tool as "never called"** — `ReviewLandingBrowserEvidence.tsx:88-91`. The `called` set uses raw transcript `toolName`, while `notCalled` derives from catalog names already redacted by the main process (`projectToolCatalog` → `webMcpDisplayText`). A credential-shaped tool name (rendered `[redacted]`) never matches, so an invoked tool is listed as never called, and several such tools collapse into one deduped `[redacted]` entry. Reproduction: page registers a tool whose name matches `WEBMCP_CREDENTIALS` (e.g. `ghp_…`); agent invokes it; landing recap lists `[redacted]` under "not called". Impact: a false statement in the landing recap only — Try it, approvals and compare use digests, not names. Fix: build both sets from catalog-side names or definitionDigest pairs instead of mixing raw and redacted names.

## P3

- `desktop-webmcp-browser.js:762,1418` — any `act`/`invoke` (including a read-only-hinted tool) sets sticky `possibleUnsavedWork`, forcing close confirmations. Conservative only; no data-loss path.
- `WebMcpApprovalToolInfo.tsx:44` — name-only fallback match across views before the digest gate; a cross-view name collision can show the generic "may differ" note instead of local hints. Never shows a wrong definition as confirmed.

## Caveats

Read-only static audit; no shell was available to this reviewer, so no test suite was run this round. Skipped per instructions: uncommitted `config/`, `pnpm-lock.yaml`, `package.json` version pins.