## Security review — same-origin framing of the app document

**Verdict: no blocking issue.** `X-Frame-Options: SAMEORIGIN` (response-headers.js:43) plus `frame-ancestors 'self'` (response-headers.js:72) still reject every foreign origin, including other `127.0.0.1:<port>` origins (an origin includes the port), so a third-party site or unrelated local dev server cannot frame the app. Preview/dashboard branches (63-66) are unchanged.

### [LOW] Proxied same-origin documents can now frame the privileged app document
**Location:** response-headers.js:43,72; preview/proxy-runtime.js:1637-1657; response-headers.js:63-66
**Category:** Clickjacking / trust-boundary widening
`SAMEORIGIN`/`'self'` cannot distinguish "our own session-chat frame" from "content the app proxies on its own origin". Two such surfaces exist and were previously denied framing:
- Local previews stay unsandboxed on the app origin by design (proxy-runtime.js:1642-1643); only external previews get the opaque-origin checkbox (1644-1657), so `'self'` correctly blocks those.
- Dashboard/run-report proxy documents (`/dre-graph`, `/run-report`, `/graph`) are same-origin with `unsafe-inline`/`unsafe-eval` and no sandbox.
**Impact:** UI-redressing/clickjacking against the app (e.g. luring a click on an approval). Real privilege gain is small: these documents already execute script same-origin and can call `/api/*` with the session cookie, so framing adds UI coercion, not new data access.
**Fix:** Accept and record the tradeoff, or restore containment by serving previews/dashboards from a distinct origin/port. Do not try to express "only the context-panel frame" in XFO/CSP — it cannot be expressed.

### [LOW] Packaged `app://` document has no `frame-ancestors` — parity gap
**Location:** desktop/packages/electron/src/desktop-renderer-protocol.js:104-132 (used at :434)
**Category:** Security misconfiguration
The app:// policy mirrors the web CSP but omits `frame-ancestors`, so the packaged document is not self-restricted (XFO is not applied on that scheme).
**Fix:** Add `frame-ancestors 'self'` to the non-proxied policy only. Do **not** add it to the `proxiedContent` variant (:109-111, :147): sandboxed external previews have an opaque origin, so `'self'` would never match and previews would render blank.

### [INFO] Embedded page trusts `sessionId`/`directory`
**Location:** App.tsx:145-169, 608-618; ContextPanel-impl.tsx:2727; openSessionBeside.ts:10-17
`directory` is taken from the URL and passed to `setDirectory`, which persists `lastDirectory` to shared storage (useDirectoryStore.ts:249-250), and `sessionId` is not cross-checked against it. The parent never acts on these values, the src is app-built, and the runtime still enforces directory ownership, so this is not a cross-directory escalation. Treat both as untrusted if a future path grants them side effects.

### [INFO] Message channels are sound
`postMessage` targets use `window.location.origin` (ContextPanel-impl.tsx:2464, 2501) and both listeners verify `event.origin` (App.tsx:581; ThemeSystemContext.tsx:495). The new try/catch (:2445-2457, :2482-2494) correctly guards cross-origin property reads. Minor test gap: response-headers.test.js:75-80 does not assert proxied branches lack `frame-ancestors`.