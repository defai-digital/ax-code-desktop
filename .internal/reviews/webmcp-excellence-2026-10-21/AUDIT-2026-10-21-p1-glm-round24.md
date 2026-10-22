All coverage gaps from the checkpoint are now closed. No new P1s found in the remaining files (`WebMcpCallDiagnosis.tsx`, `WebMcpCancellationStatus.tsx`, `WebMcpBuilderHint.tsx`, `WebMcpBrowserTools.tsx`, `McpDropdown.tsx`, `stores/useWebMcpApprovalOutcome.ts`, `useWebMcpBrowser.ts`, `webmcp-check-entry.cjs`, `SessionGrid.tsx` pop-out paths). Notable confirmations from this final pass: the checker entry hardens its hidden window (sandbox, contextIsolation, popup/permission/download denial), enforces the loopback/https origin rule on every navigation and redirect, stops remaining runs after an unconfirmed timeout ("contaminated"), and passes every report write through `redactWebMcpReport` before it touches disk; approval receipts are bounded at 256, redacted, and never persisted; the pop-out keeps exactly one browser owner via native-window reconciliation.

# WebMCP P1 Audit — branch r24 (final, read-only)

**Method:** static line-audit of every file named in the task plus the shared modules they call (`webmcp-page.js`, `browser-eviction.js`, `webmcp-catalog-projection.cjs`, `webmcp-view-key.mjs`, `webmcp-digests.cjs`, `webMcpToolForm.ts`, close-confirmation/pages/approval hooks, `desktop_webmcp_browser` IPC registration). No files modified; no shell available, so no test run — disclosure, not a claim of verified builds.

## P1: **none**

## Round-24 fixes — verified present

1. **Bracketed assignment redaction** (`desktop/shared/webmcp-redaction.mjs:48-80`): URL pair scan decodes parameter names across query/hash/path/matrix; the assignment scanner accepts only complete quoted `[redacted]`/`<fill in>` placeholders as safe; fails closed past 31 decode layers.
2. **Inherited field sensitivity** (`webmcp-redaction.mjs:125-173`): `inheritedField` propagates through nested objects/arrays; local `name/key/field/path/instancePath/pointer` declarations replace context, conflicting declarations fail closed, and `value/got/input/...` keys redact under inherited sensitivity.
3. **Owner-window close recovery** (`desktop-webmcp-browser.js:505-540, 1136-1143`): `ownerGone()` closes with a bounded disconnect, recovers via `recoverOwner()`, and re-adopts; foreign windows keep only disclosed focus handles.

## Earlier rounds — spot-verified

One-use close approvals bound to action/view/webContents identity (max one re-prompt, no self-changing-page loop); eviction honors `beforeunload` with sticky unsaved-work flags and 250 ms probes; origin-only persisted address history; `tryTool` bound to origin+generation+digest+opaque invocationID; approval card shows page claims only on exact digest match with no unnamed "Always" for the desktop provider; cancellation summaries distinguish stopped/still-finishing with 2 s-bounded replies; checker exit codes 0/1/2/3/64, keyed HMAC receipts before redaction, tree-killing watchdog, contaminated-run stop; landing recap scans the whole turn and never claims "not called" on unknown association; checker entry hardened and redacted before every disk write.

## P2

1. **Stale local error banner can outlive a recovered browser** — `EmbeddedWebMcpBrowser.tsx:180, 389-394`. Repro: a failed command (e.g. navigate IPC failure) sets `commandErrorRef="operation-failed"`; each later poll with `error: null` revives it via `result.error ?? commandErrorRef.current`, so the banner persists while the browser actually works, until another command runs. Impact: reads as a false failure state; the Fix button self-heals it. Deliberate per code comment, but misleading within that window.
2. **Replay can silently submit the redaction placeholder** — `WebMcpToolPanel.tsx:538-546, 641` + `webMcpToolForm.ts:169-172` + `useWebMcpBrowserStore.ts:577`. Repro: a Try-it with a sensitive-named field journals `<fill in>`; Replay loads it into the masked field; pressing Try sends the literal string `"<fill in>"` as the value with no send-time guard. Impact: a user can unknowingly submit a placeholder (page rejects it; no secret leaks). Documented; diagnosis skips placeholders.

## P3 (brief)

- `desktop-ipc-contract.json:29` omits `input/origin/generation/definitionDigest/closeConfirmation` that real callers send; they bypass contract validation (command() validates them itself) — drift only.
- Pool-full eviction considers only same-window idle views (`desktop-webmcp-browser.js:922-943`); mitigated by the banner + focusOwner.
- Replayed enum values not among options render a blank select (`WebMcpToolPanel.tsx:337`).

**Verdict: no P1** — the definition-of-done bar ("no P1 finding after the last round") is met on this audit.