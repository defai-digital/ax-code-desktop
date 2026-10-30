# AkiTTY Web source migration

Date: 2026-10-30
Desktop base: c7bf29478abb440d18aa363d3e324f95b2cde020
Implementation: integrated in 5c5fabdb and published in 7.30.4; see RELEASE-2026-10-30-v7.30.4-publication.md.

## Source

Imported `defai-digital/akitty` commit `d7f23f54c236515ec4c325ba838517b5ec29d632`,
`packages/akitty-web`, version 0.5.0. All 47 imported files are byte-identical to the GitHub archive.
SOURCE.json records each SHA-256. Package.json has only three Desktop adaptations: two catalog dependencies and
the source-verification hook before typecheck. The upstream npm lockfile is omitted; pnpm regenerated its lockfile.
ADR-024 supersedes Desktop's independent terminal-source ownership; ADR-023 remains historical.

The existing workspace import now resolves the actual AkiTTY implementation, including viewport caching, hidden-pane
render suspension, render-error recovery and read-only agent APIs. Desktop does not register the new agent tools.
The Ghostty VT wasm and explicit same-origin asset loader remain compatible; this is a browser terminal migration,
not integration of the native Rust/Swift terminal.

## Verification

- Source integrity: 47 files match the pinned archive. In a disposable copy, changed, missing and extra source files
  each fail verification; the restored copy passes.
- Root boundaries, locales, typecheck and lint: passed.
- AkiTTY suite: 369 passed, one opt-in timing probe skipped.
- Web renderer build: passed; large-chunk and Node fs browser-externalization warnings were emitted.
- Full root test run: 8,663 passed, 11 skipped across scripts, AkiTTY, Electron, UI and web packages.
- Root shell build: passed (all three Turbo tasks).
- Native WebMCP smoke: passed boot, preload bridge, native tool invocation, CSP and renderer-exception checks. Artifacts: `/tmp/ax-akitty-webmcp`.
- Native workspace journey: passed, including the embedded Terminal tab, preserved Files tab, pane resizing, dark/light layouts, CSP and renderer-exception checks. Fresh DOM state and screenshot: `/tmp/ax-akitty-workspace/open-beside-terminal.json` and `.png`. Full receipt: `/tmp/ax-akitty-workspace/results.json`. The terminal screenshot shows its viewport and cursor with a Loading status; the journey asserts container layout, not completed PTY readiness or shell output. Real shell command execution remains unqualified.

Logs are under `/tmp/ax-akitty-*.log`. No signed package, installed application or production runtime is qualified by these checks.
