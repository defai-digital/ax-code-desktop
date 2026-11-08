# Electron 45.2.3 stable upgrade review

Date: 2026-11-08.
Baseline: `31274a334ff00c10fc99f41b9803603d4209454a`, Electron `44.9.1`.
Status: Source and generated lockfile updated; final workspace and packaged validation in progress.
This work does not authorize a release.
Specification: [Electron 45 stable v1](../spec/SPEC-2026-11-08-electron-45-stable-v1.md).

## Changes

- Pin Electron to the exact stable `45.2.3` in the manifest and pnpm-generated lockfile and update the root README.
- Disable legacy `webviewTag` in the Mission Control pop-out. Its view-only renderer has no context-panel webview.
  Preserve the shared sandboxed preload and window guards. Main/additional workspace windows keep their browser
  preview support. This selects Electron 45's lighter startup path for this pop-out; no timing gain is claimed.
- Strengthen the existing window behavior test. Before the change it fails with `webviewTag: true`; after the change
  all seven supervision-window tests pass, including load-failure cleanup and navigation/window-open restrictions.

The user requested feature adoption as well as the dependency bump. Engine improvements to macOS cold launch,
native menus/calls, and ASAR I/O arrive with the engine. New application APIs still require a concrete product need.
The current authenticated `app://` proxy and hashed CSP remain necessary; a wholesale static-protocol replacement
would not preserve them. Desktop does not add a second model-inference implementation through Local Prompt API.

## Compatibility findings

The [45.2.3 release record](https://releases.electronjs.org/release/v45.2.3) specifies Chromium `156.0.8078.80`,
Node `24.22.2`, and V8 `15.6.75.27`. Native macOS probes confirmed the Electron, Chromium, and Node versions and ABI `150`.
The repository's build toolchain remains Node `>=26`; Electron's embedded Node version is a separate concern.

The [Electron 45 announcement](https://www.electronjs.org/blog/electron-45-0) describes renderer bootstrap avoidance
when `webviewTag` is disabled, macOS framework prefetching, and native menu/API improvements. Main workspace windows
still need the legacy webview in `ContextPanel-impl.tsx`, so that bootstrap optimization is scoped to Mission Control.
No packaged performance baseline was measured.

The [breaking-change guide](https://www.electronjs.org/docs/latest/breaking-changes) removes preload Node shims and
immediate/Buffer globals in 45. The current preload bundles its local modules and only requires Electron externally.
Capture policy remains deny-by-default. Native modules remain unpacked. Clipboard modernization and removal of
32-bit targets are already Electron 44 changes, not new migrations from this repository's baseline.

WebMCP already worked on Electron 44 in this repository. The current main process enables `WebMCP` before readiness,
and the fixtures already use `document.modelContext`. A successful 45 probe establishes exact-engine compatibility;
neither a Chromium major number nor origin-trial assumptions replace this check.

## Preliminary isolated checks

Before the SDK cache was populated, the full repository installation was unavailable. Public-only dependencies were installed with pnpm in an isolated
temporary workspace: Electron `45.2.3`, `node-pty` `1.1.0`, `@electron/rebuild` `4.2.1`, Vitest `4.1.12`, jsdom `27.4.0`,
and esbuild `0.28.1`. No SDK substitute or sibling repository was used.

| Check | Result | Scope |
| --- | --- | --- |
| Existing native WebMCP smoke | Disabled, enabled, enabled-repeat passed | Real macOS arm64 Electron; [generated records](electron-45-20261108/native-webmcp-summary.json) |
| Native module rebuild | Passed | `node-pty` rebuilt for Electron `45.2.3` in the isolated workspace |
| Existing native compatibility smoke | 14 locale menus and PTY round trip passed | Unchanged smoke entry in a mirrored dependency layout; [receipt](electron-45-20261108/native-compatibility.json) |
| Sandboxed preload probe | Passed with `webviewTag` false and true | esbuild-bundled repository preload, real IPC invocation, boot outcome, no renderer Node access; [receipt](electron-45-20261108/sandboxed-preload.json) |
| Focused Vitest | 6 files, 313 tests passed | Native WebMCP, embedded browser, page operations, preload IPC policy, supervision window, webview policy |
| Regression before implementation | 1 failed, 6 passed | Supervision window expected legacy webviews disabled; baseline returned true |

The Vitest run used an isolated config with the repository Electron source as its root, the isolated Vitest entry
as its `vitest` alias, and `NODE_PATH` for jsdom resolution. It exercised existing source/tests but is not the standard
workspace test gate. The native compatibility smoke used the same source entry, repository manifest, localization
source and locale catalog, with the isolated native dependencies. An initial direct invocation could not resolve
`node-pty` in Electron; the mirrored layout supplied the expected package-local resolution without changing product code.

The preload probe loaded a controlled loopback page in real sandboxed, context-isolated windows. It verified the
desktop bridge, successful boot outcome, allowed IPC response, and absence of renderer `require`/`process` in both
webview modes. Initial scratch-probe attempts closed the last window between cases, interrupting the next load;
keeping both windows alive until final cleanup resolved the harness failure. No product workaround was needed.

## Verified SDK cache bootstrap

Initial dependency installation could not fetch the pinned SDK from GitHub Packages (HTTP 401 without registry
authentication; HTTP 403 with the existing GitHub login). No token was persisted in this repository or its evidence.

The canonical producer's [sdk-v2.6.69 release](https://github.com/defai-digital/ax-code/releases/tag/sdk-v2.6.69)
retains `registry-readback.tgz`, the bytes read back from the published registry, plus package/source receipts.
Its SHA-512 exactly matches the existing lockfile integrity. Its SHA-256 matches the official package receipt;
the source receipt matches the tag and producer commit in `config/ax-code-sdk.json`.
See the retained [package receipt](electron-45-20261108/sdk-package-receipt.json) and
[source receipt](electron-45-20261108/sdk-source-receipt.json).

`pnpm store add` imported that verified archive. The unchanged content-addressed package index was copied to the
canonical `@defai-digital/ax-code-sdk@2.6.69` cache key, then `pnpm fetch --prefer-offline` hydrated the locked dependency
graph. No SDK files or registry metadata were fabricated. The exact published SDK and registry declarations are
unchanged; no sibling source, credential, alternate SDK version, or repository tarball dependency was introduced.

pnpm generated the upgrade lockfile with `pnpm install --lockfile-only --prefer-offline
--config.dedupe-peer-dependents=false`, preserving the cached fixed SDK resolution instead of forcing registry
metadata re-resolution. A subsequent standard `pnpm install --frozen-lockfile --prefer-offline` passed. The lockfile
was never edited manually. Peer snapshot links were regenerated by pnpm along with the Electron pin.

## Final workspace verification

Validation is in progress. Windows/Linux execution, signed packaging, upgrade/rollback, and live site compatibility
remain platform-specific release gates; local macOS evidence does not substitute for them.
