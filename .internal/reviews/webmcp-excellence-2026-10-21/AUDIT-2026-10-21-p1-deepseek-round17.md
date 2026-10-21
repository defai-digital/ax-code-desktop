Resumed the two scopes I had left open (`webmcp-check*`, `WebMcpPages.tsx` / `useWebMcpPages.ts`). Both are now audited; neither changes the verdict.

## WebMCP audit — final (branch `r17-audit`, read-only, nothing modified)

### Verdict: no P1

All named files are now covered. I found no confirmed defect where a person loses work, the agent acts on the wrong page/session/project or without approval, a credential reaches screen/logs/storage, the UI claims a success or rollback that did not happen, a pane hangs with no recovery, or a documented flow fails.

### Fixes verified in code

- **Checker exit codes fail closed** (`webmcp-check-lib.mjs:85-144`): identity matched via keyed HMAC receipts *before* redaction (`:88-96`), a report missing `identityReceipt`/`inputReceipt` produces exit 1 rather than passing, engine timeout/nonzero/signal → 1, expected tool missing → 1, no tools → 2, failed run → 3, usage → 64 — matching `docs/webmcp-page-tools.md:210-216`. A timed-out run contaminates the rest (`webmcp-check-entry.cjs:117-147`), which surfaces as exit 3.
- **Report redaction** on every write (`webmcp-check.mjs:19,59,66,77,79`; entry `:31,158`); `--url` rejects credentials and non-loopback `http` (`lib:16-26`).
- **1:1 page binding**: `tryTool` compares origin + generation + definition digest (`desktop-webmcp-browser.js:1394-1429`); `execute` re-checks generation/origin/frameId and drops references on invalidation (`native-webmcp.js:306-317`, `143-152`); navigation re-validates the document before loading (`desktop-webmcp-browser.js:600-615`).
- **Approval honesty**: effect sentence built from call data only, page text labelled as the page's claim, required inputs merged (`WebMcpApprovalToolInfo.tsx:10-22,73-91`), no standing grant for the embedded browser (`PermissionCard.tsx:200-207,608`).
- **Close/eviction safety**: bounded 250 ms probes, sticky unsaved-work flag, `beforeunload` honored including late installs, one-use identity-bound confirmation with at most one re-prompt (`browser-eviction.js:5-68`, `desktop-webmcp-browser.js:408-457,474-499,1485-1521`).
- **Redaction completeness** (`shared/webmcp-redaction.mjs:87-188`): recursive, embedded-JSON, sensitive-name, decode loop fail-closed, no raw fallback on proxy errors.

### P2 findings

1. **Status poll re-serializes the whole catalog each second.** `useWebMcpBrowserStore.ts:196-206` `JSON.stringify`s every field; `desktop-webmcp-browser.js:69,522` clones/ships up to 256 KiB of schema per poll (`EmbeddedWebMcpBrowser.tsx:336-349`). Repro: 4 pages with large schemas → sustained CPU and typing jank. Fix: compare `generation` + digest.
2. **A Try it that lands after the view changed shows nothing.** `WebMcpToolPanel.tsx:662-671` returns before `showResult`, so a call that ran on the previous page leaves no row and no notice. Fix: keep a `stale` row.
3. **Sign out can partially apply.** `desktop-webmcp-browser.js:1156-1178`: dormant addresses are forgotten and authorized pages closed before `clearStorageData()`; if clearing throws the user sees `operation-failed` while pages/history are gone, contradicting `docs:263-271`.
4. **A cancelled quit still closes the pages that did not refuse** (`desktop-webmcp-browser.js:1485-1521`), although `docs:133-137` reads as if the session survives.
5. **Digest vocabulary is still ambiguous (contract-dependent).** `toolHelpers.ts:397-401` accepts `metadata.digest`/`schemaDigest` as the *definition* digest; if a runtime sends a catalog digest there, the recap prints a false `definitionChanged` (`ReviewLandingBrowserEvidence.tsx:107-111`).
6. **Checker can list page A and run page B.** `webmcp-check-entry.cjs:77-81` clears the catalog on navigation, but `report.tools` is already written (`:108-116`), so a same-origin redirect between settle and run executes against a different document with the same tool name. No false success for `--expect-tools` (receipts are name-bound), but the reported catalog can be stale.
7. **Address bar over-redacts** assignment-shaped queries: `webmcp-redaction.mjs:71-79` + `EmbeddedWebMcpBrowser.tsx:505-506` turn `…?q=token:foo` into `[redacted]` while the draft still navigates. Fails closed, costs recoverability.
8. **Slow-dying page reads as a generic error.** `browser-eviction.js:58` (1 s) surfaced at `desktop-webmcp-browser.js:478-480` → `operation-failed` instead of "page refused to close".
9. **Sticky unsaved-work flag saturates the pool.** `desktop-webmcp-browser.js:983-987`: one keystroke/click excludes a view from eviction forever, so four touched pages mean `pool-full` until a manual close.
10. **Silent no-op on page switch.** `useWebMcpPages.ts:42-53`: if `openSupervisedSession` cannot open the session, selecting a stale/unloaded page does nothing and shows no error.

### Limits

Static review only; no app run this round, so hangs/dialogs are inferred from control flow. Runtime-owned contracts (permission metadata, `WebMCP.*` event replay) are assumptions, not verified here — item 5 depends on that contract. To sign off DoD item 3, the next run should exercise: pool-full with four touched pages, a quit refused by one page, and `webmcp:check` against the quickstart plus a failing tool.