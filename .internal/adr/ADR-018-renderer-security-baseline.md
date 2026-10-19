# ADR-018: Renderer security baseline

Status: Accepted for user-authorized implementation on 2026-10-19.
PRD: PRD-2026-10-19-competitive-quality-v1.md. Specification: SPEC-2026-10-19-renderer-security-baseline-v1.md.

## Context

Guest webviews, the wiki viewer, the launch animation and the WebMCP browser already set `sandbox: true`. The main window,
additional windows and mini-chat windows share `createDesktopRendererWebPreferences`, which omits `sandbox` and relies on
Electron's default. The privileged preload is already bundled for a sandboxed renderer.

The packaged `app://` renderer CSP allows `script-src 'unsafe-inline'` because `index.html` carries four small inline
bootstrap scripts (theme before first paint, loading fallback, font loading, `process` polyfill). The loopback web-server
CSP allows `'unsafe-inline'` and `'unsafe-eval'`. The packaged renderer already runs without `'unsafe-eval'`, which shows
that the shipped UI does not need it.

## Decision

1. Every Desktop-created `BrowserWindow` sets `sandbox: true` explicitly. A regression test fails if the shared preference
   factory drops it.
2. The packaged renderer CSP replaces `'unsafe-inline'` in `script-src` with SHA-256 hashes of the inline scripts in the
   HTML document being served. Non-HTML responses carry no script hashes. `'wasm-unsafe-eval'` stays for the terminal's
   WebAssembly renderer.
3. The loopback web-server CSP drops `'unsafe-eval'` and adds `'wasm-unsafe-eval'`, matching the packaged policy. Inline
   scripts stay allowed there until the web build emits hashes, because browser mode serves Vite output directly.
4. `style-src 'unsafe-inline'` stays. React and CodeMirror set inline styles; removing it is out of scope.
5. `runAsNode` stays enabled. The packaged desktop CLI uses the Electron binary as its Node launcher (see
   `electron-builder.yml`). Revisit when that launcher is separate.
6. `webviewTag` stays enabled for the browser pane; `applyDesktopBrowserWebviewPolicy` remains the guard.

## Consequences

A new inline script in a served HTML document is allowed automatically by hash, so authors do not need to edit the CSP,
but an injected inline script from any other source is blocked. Any library that needs `eval` now fails in browser mode as
it already would in the packaged app; the end-to-end harness reports such violations. No runtime, SDK, identity or
updater contract changes.
