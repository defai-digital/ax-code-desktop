# Mermaid rendering and export improvements

## Plan and scope

The user requested implementation, tests, and a commit after a source-backed assessment identified silent rendering
failures, incomplete diagram coverage, synchronous layout, and limited sharing controls.

1. Extract the diagram component and make streaming, loading, unsupported input, syntax/layout failure, and retry states explicit.
2. Add a versioned capability contract and an on-demand official Mermaid renderer for additional SVG-only diagram types.
3. Move the existing renderer's layout into a cancellable worker; bound pending work and caching. Add source switching and PNG sharing.
4. Qualify source changes with unit/component tests, production builds, and native Electron rendering before committing.

Work was isolated on `fix/mermaid-support`, starting from `1c2167a9`, because the primary checkout contained unrelated
permission and session changes. Those changes were not edited or included. This work changes no runtime ownership,
runtime/SDK pin, execution authority, signing identity, updater, or public distribution state.

## Implemented behavior

- The six existing diagram families retain SVG and ASCII support through exact `beautiful-mermaid@1.1.3`.
- Exact `mermaid@12.2.0` adds SVG previews for pie, Gantt, mindmap, timeline, quadrant, Sankey, and treemap diagrams.
  SVG-only types explicitly explain the ASCII limitation instead of silently displaying source as though rendering succeeded.
- `mermaidCapabilities.json` is consumed by the renderer and checked against the fixture corpus and dependency pins.
  The new v1 spec records capability constraints. AGENTS.md points to the contract rather than duplicating its type list.
- Streaming waits for finalized input. Loading and failure states preserve source, and stale asynchronous results are ignored.
  Source configuration/frontmatter and inputs beyond 20,000 characters or 500 lines receive actionable messages.
- Worker layout has cancellation and an eight-second deadline. A serialized queue admits at most 32 pending jobs.
  Cached results are limited to 32 entries/two million source-plus-output characters. Layout is never silently moved back
  onto the UI thread if the worker fails. Official Mermaid's DOM-dependent rendering remains on the UI thread with input bounds.
- The ELK bundle used by beautiful-mermaid assumes browser/CommonJS globals. Its worker adapter temporarily supplies a document
  environment marker and writable self binding while loading/layout runs, then restores those properties and setTimeout.
  Real Electron execution caught this compatibility issue; mocked worker lifecycle tests alone did not.
- Both renderers' SVGs are sanitized before display/cache/export. External resources, embedded HTML, scripts, and event handlers
  are removed; local marker references, themed text styles, and harmless keyframes are preserved. No external rendering service.
- Source/diagram toggle, source/ASCII copy, SVG/PNG download, and capability-gated PNG clipboard copy are available. PNG encoding
  is limited to 8,192 pixels per axis and 16 million pixels. Fullscreen controls remain visible within their viewport.
- SVG intrinsic dimensions prevent small charts from expanding to conversation width. Pie palettes and label colors remain
  legible in light and dark themes. New messages are included in all 14 existing interface locales.

## Validation

Local validation used macOS arm64, Node 26, pnpm 10.33.4, and the project's pinned Electron 44.9.0.

| Check | Result |
| --- | --- |
| Full UI Vitest suite | 509 files, 3,330 tests passed |
| Focused Mermaid tests | Capability coverage, lifecycle cancellation/stale output, queue/cache bounds, retry, export bounds, and SVG sanitization passed |
| Workspace typecheck and lint | Passed |
| Boundary and release contracts | Passed |
| Localization | 14 locales, 4,928 keys, 64,064 translated entries passed |
| Frozen offline install | Passed |
| Production web renderer build | Passed; worker and official-renderer chunks emitted |
| Native Electron smoke | 39 rendering/export cases and interaction checks passed under `app://ax-code` and the production CSP |

The native receipt is in `mermaid-20261018/native-smoke.json`. It covers each of the 13 diagram types in both themes,
PNG decoding/nonempty pixel content, the six existing ASCII types in both themes, CJK flowchart/pie labels, and a 181-node
flowchart. Native interactions cover dark-theme text styling, fullscreen bounds, a real PNG download, source switching,
the SVG-only type's ASCII limitation message, and streaming deferral. Light/dark pie screenshots were visually inspected.

The large-flowchart timings and UI timer ticks in the receipt are observations from one local run, not a cross-platform
benchmark or a whole-app responsiveness claim. The smoke retains the existing Chromium diagnostics for IPv6 wildcard
sources in the production CSP, while failing on any other renderer error; no CSP permissions were changed.

Reproduce the native check with `pnpm run smoke:mermaid`. For manual inspection, run
`pnpm --dir desktop/packages/ui exec vite --config dev/mermaid/vite.config.ts` and open the displayed loopback URL.
The fixture is a development entrypoint and is not included as an application route.

## Limits

- Native execution was qualified on macOS only. Windows/Linux native execution, signed installation, and a released package
  were not qualified or published by this task.
- Official Mermaid rendering requires DOM access and does not have a hard worker CPU deadline. It is lazy, serialized,
  and input-bounded. The advertised set is a verified subset, not a promise of every Mermaid syntax extension.
- PNG encoding/download is natively exercised. System clipboard permissions vary by host; image-copy availability is gated
  and errors are visible, but the native smoke intentionally does not replace the user's system clipboard.
- Vite reports large-chunk size warnings; successful compilation is not a bundle-size or startup-performance benchmark.

Rollback is a source/dependency revert; there is no persisted-data migration.
