All coverage gaps are now closed. The remaining files confirmed the earlier picture — no new issues rise above P3. Final audit result follows.

# WebMCP audit (branch r21, HEAD 5ef139d8, after round 21) — final result

**Verdict: no P1.** Full coverage of the requested file list, including the previously unread files (`WebMcpBrowserTools.tsx`, `WebMcpBuilderHint.tsx`, `WebMcpCallDiagnosis.tsx`, `webMcpBridgeCoordination.ts`, `SessionGrid.tsx`, `webmcp-check-receipt.cjs`, `webmcp-digests.cjs`, `load-url-timeout.js`, `webmcp-view-key.mjs`) plus direct helpers (`browser-eviction.js`, `webmcp-page.js`, `webmcp-catalog-projection.cjs`, `webMcpToolForm.ts`, approval-outcome stores/hooks, IPC wiring in `main.js`/`preload-ipc-policy.js`/`desktop-ipc-contract.json`). Read-only; no files modified.

## Round-21 fixes verified

- **One redaction entry point** — every display/log/persistence site routes through `shared/webmcp-redaction.mjs`: catalog projection (`webmcp-catalog-projection.cjs:67-71`), tool panel, call strip, permission card, close confirmations (`useWebMcpCloseConfirmation.tsx:21`), journal/runs (`useWebMcpBrowserStore.ts:341-384`), checker reports (`webmcp-check.mjs:19,59,66,77-87`; entry `save()` at `webmcp-check-entry.cjs:31`), main→renderer status (`desktop-webmcp-browser.js:406,470-480`), bridge-coordination warnings (`webMcpBridgeCoordination.ts:57,68,89`).
- **Field-context propagation** — `webmcp-redaction.mjs:83-97` (`FIELD_NAMING_KEYS`/`FIELD_PATH_KEYS`/`FIELD_VALUE_KEYS`, `sensitiveFieldName`), consumed by the `[name,value]` pair rule (line 137) and JSON-pointer decoding (94-96).
- **No silent input shortening** — `readWebMcpInvokeInput`/`redactInvokeRecord` (`toolHelpers.ts:393-421`) return `truncated` with `input:null` instead of partial bags; journal `boundJournalInput` collapses to `{}, truncated:true`; `webMcpResultPreview` filters whole strings before truncating; checker receipts HMAC the unredacted input with a per-check random key (`webmcp-check-receipt.cjs:14-22`) so redacted disk reports still compare original identities (`webmcp-check-lib.mjs:88-96`).

Earlier-round items spot-checked and holding: visibility/pause wait with cancellation and 2s-bounded replies; beforeunload-honoring eviction with 250ms-bounded probes and sticky unsaved-work flags; one-use close confirmations bound to action + webContents identity with a single reprompt; origin-only persisted history (`safeWebMcpAddress`); opaque tool identities with collision-safe `tryTool` binding (origin + generation + definitionDigest, `desktop-webmcp-browser.js:1346-1383`); honest manual outcomes (`manualToolResult`/`manualToolFailure` strip page exception text — including `interact()`'s page-authored error string); the pause/resume bridge epoch fix; pop-out keeps one browser owner (`SessionGrid.tsx:288` hides the page control when popped; `sessionGridPopout.ts` releases ownership only via the native window inventory); fixed injected page program with regex-validated, JSON-serialized arguments; view keys are lexical with `..` popping and a `\0` separator (`webmcp-view-key.mjs`); digests are canonical sha256 with bounded nesting, cycles rejected as `invalid-schema`.

Boundaries re-verified: `desktop_webmcp_browser` is main-frame-only, contract-validated, `safeForRemote:false`; runtime API pinned to `http://127.0.0.1/` without userinfo/path/query; per-project hashed partitions, deny-all permissions, blocked downloads; sandboxed views with no preload/Node; popups deny nested opens and non-HTTP(S) or credentialed URLs. No hardcoded secrets (`DESKTOP_BROWSER_TOKEN` generated per launch, `desktop-webmcp-browser.js:23`).

## P2 / P3 (not P1)

1. **[P3] Redrafted address on Go** — `EmbeddedWebMcpBrowser.tsx:491,506`: non-draft mode shows `redactWebMcpText(url)`; **Go** navigates to the redacted string. Only when the live URL's query/fragment is credential-shaped; explicit user action, beforeunload still guards. Keep the raw URL in a ref for non-draft Go.
2. **[P3] Pooled `show` failure reads as start-failed** — `EmbeddedWebMcpBrowser.tsx:258-263`: a rejected follow-up `show` marks the pane error while the view exists; the reopen affordance recovers.
3. **[P3] Dead condition** — `desktop-webmcp-browser.js:384-388`: `document.entry.possibleUnsavedWork` tested twice.
4. **[P3] Per-poll stringify** — `useWebMcpBrowserStore.ts:197-206` compares all fields via `JSON.stringify` each 1s poll; correctness unaffected, minor overhead.
5. **[P3] Inert parameter** — `WebMcpCallDiagnosis.tsx:91` passes `currentDigest={call.definitionDigest}`, so its own "definition changed" note can never fire; the landing recap renders the real changed marker against the live page digest (`ReviewLandingBrowserEvidence.tsx:168-175`), so nothing false is stated.

## Caveats

Static source audit only — no shell tool in this session, so `pnpm test`/`typecheck` were not run (and were out of scope for a read-only audit). Uncommitted files under `config/`, `pnpm-lock.yaml` and `package.json` version pins were ignored as instructed.

**Definition-of-done item 3: satisfied — no P1 finding in this audit run.**