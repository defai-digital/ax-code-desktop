# Renderer security baseline v1

Status: Accepted for implementation on 2026-10-19.
Decision: ADR-018. PRD: PRD-2026-10-19-competitive-quality-v1.

## 1. Window preferences

- `createDesktopRendererWebPreferences(preload, options)` returns `sandbox: true` together with the existing
  `contextIsolation: true`, `nodeIntegration: false`, `webSecurity: true` and `webviewTag: true`.
- Callers must not override `sandbox`. The preload bundle stays compatible with a sandboxed renderer: it may require only
  `electron` and modules that the bundler inlines.
- Test: `webview-policy.test.mjs` asserts the full returned object, including `sandbox: true`.

## 2. Packaged renderer CSP (`app://ax-code`)

- `buildPackagedRendererCsp({ inlineScriptHashes })` emits `script-src 'self' 'wasm-unsafe-eval' 'sha256-…'…`, one source
  per well-formed hash. With no hashes it emits `script-src 'self' 'wasm-unsafe-eval'`. Values that are not
  `'sha256-<base64>'` are dropped, so callers cannot widen the policy.
- `collectInlineScriptHashes(html)` returns base64 SHA-256 digests of every `<script>` element without a `src` attribute
  and with an executable type (none, `text/javascript`, `application/javascript` or `module`). JSON and `importmap` data
  blocks are not hashed. Text is hashed after HTML input preprocessing (CRLF and lone CR become LF), as the browser does.
  Digests are deduplicated and sorted.
- The protocol handler computes hashes only for `text/html` responses, from the bytes it serves. Other responses use the
  hash-free policy. Bytes are served unchanged.
- Header stage (`session.webRequest.onHeadersReceived` in `main.js`) uses `resolvePackagedResponseCsp(url, existing)`:
  - static renderer responses that already carry the handler's policy get nothing appended, because combined policies
    intersect and a hash-free copy would block the document's inline scripts;
  - proxied loopback responses (`isLoopbackApiPath`: runtime dashboards and run reports) get
    `buildPackagedRendererCsp({ proxiedContent: true })` appended beside any upstream policy. That policy keeps
    `'unsafe-inline'` for scripts because Desktop does not author those documents, and still has no `'unsafe-eval'`.
- Every other directive is unchanged, including `style-src 'self' 'unsafe-inline'`.
- Tests cover: every inline script in the shipped `web/index.html`, external and module-src scripts ignored, data blocks
  ignored, deduplication, newline normalization with non-ASCII text, rejected non-hash values, non-HTML responses, and the
  header-stage cases.

## 3. Loopback web-server CSP

- App routes: `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'`. `'unsafe-eval'` is removed. Inline scripts remain
  until browser mode serves hashed HTML.
- Preview-proxy and dashboard-proxy routes keep the previous policy, including `'unsafe-eval'`. They render user or
  runtime pages that Desktop does not author, and the proxy already rewrites upstream CSP headers for framing.
- `connect-src` is unchanged in v1. Narrowing it needs an inventory of browser-mode connections first.
- Tests cover both route classes.

## 4. Verification

The end-to-end harness (SPEC-2026-10-19-desktop-e2e-harness-v1) launches the built app and fails on any
`securitypolicyviolation` event or CSP console error in the main renderer.

## 5. Rollback

Each change is local to one function. Reverting the commit restores the previous policy without data or identity effects.
