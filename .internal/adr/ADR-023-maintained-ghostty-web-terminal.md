# ADR-023: Maintain the ghostty-web terminal emulator in the Desktop repository

| Field          | Value                                                                    |
| -------------- | ------------------------------------------------------------------------ |
| Status         | Accepted by explicit maintainer instruction, 2026-10-29                  |
| Implementation | Implemented; baseline `coder/ghostty-web` v0.4.0                         |
| Date           | 2026-10-29                                                               |
| Related        | ADR-002 (product and source boundary); ADR-018 (renderer security baseline) |

## Context

The session terminal renders through `ghostty-web` (MIT, maintained by Coder): Ghostty's VT parser compiled to
WebAssembly with an xterm.js-compatible canvas front end. Desktop consumed the npm release. Its last stable release,
0.4.0, dates from 2025-12; upstream `main` carries 21 later commits, including crash and input fixes, that have not
been released. Desktop also depends on several internals the package does not expose (renderer scrollbar painting,
`scrollToBottom`, focus, the hidden textarea), patched from `TerminalViewport.tsx` at runtime.

Embedding native Ghostty (libghostty with Metal) was considered and rejected: its embedding API is unversioned, a
native view over the Electron window fragments focus and layering, it adds a Zig toolchain and a native module to
signing, and it would split the Mac terminal from every other platform.

## Decision

### D1 — Desktop owns a copy

Desktop vendors ghostty-web as the private workspace package `desktop/packages/ghostty-web` (`@ax-code/ghostty-web`)
and maintains it. Releases follow Desktop, not upstream. Upstream is a source of reviewed fixes, not a dependency.

### D2 — Source, not a bundle

The package exports its TypeScript source and the renderer build compiles it. The VT wasm is a committed artifact
with recorded provenance: Ghostty commit, wasm API patch, Zig version and sha256 in the package's `UPSTREAM.md`.
`scripts/build-wasm.sh` rebuilds it from those pins; Ghostty itself is not vendored.

### D3 — Traceable changes

The baseline `lib/` is byte-identical to the upstream tag. Every later change to `lib/` or the patch is recorded in
`UPSTREAM.md` with its reason, and every upstream sync is a reviewed diff. The upstream test suite runs in the
package's `test` script and therefore in CI.

### D4 — Attribution

The ghostty-web and Ghostty MIT licenses ship in the package directory, and both NOTICE files credit them (AGENTS.md
governance).

## Consequences

- Desktop can fix the terminal and take unreleased upstream fixes on its own schedule.
- Desktop carries the maintenance: security and correctness fixes from Ghostty and ghostty-web reach users only when
  someone syncs them. `UPSTREAM.md` keeps the unreviewed upstream backlog.
- A wasm change needs Zig `0.15.2`; ordinary TypeScript changes do not.
- The renderer no longer ships the npm bundle's inline base64 wasm, which shrank the terminal chunk by about 565 KB.
- The runtime monkey-patches in `TerminalViewport.tsx` can now become supported options in the package; that is
  follow-up work, not part of this decision.
