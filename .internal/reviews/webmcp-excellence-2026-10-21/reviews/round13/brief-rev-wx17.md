# Review WX-17 builder CLI (read-only, English). Findings by severity with path:line, or "no blocking issue". Do not modify files.
Uncommitted new files in this repository: desktop/packages/electron/scripts/webmcp-check.mjs (launcher), webmcp-check-entry.cjs
(Electron entry), webmcp-check-lib.mjs (+ .test.mjs), the root package.json script `webmcp:check`, and a new "In CI" section in
docs/webmcp-page-tools.md. It loads a page in the bundled engine with native WebMCP, lists page tools, runs named tools with
JSON-string input, and exits 0/1/2/3/64. Check: URL rule (https, loopback http, no credentials) and redirects to other origins,
sandboxing and hardening of the throwaway window (popups, permissions, downloads, profile cleanup), executeJavaScript injection
safety (tool names and inputs from the command line), timeouts and hung pages, exit-code correctness including tools that throw,
Windows/macOS/Linux behavior (paths, Electron spawn, xvfb on Linux CI), and whether the docs match the behavior.
