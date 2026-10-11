# Electron 45 WebMCP Candidate Qualification, 2026-10-11

Status: Implemented and locally validated development/shadow candidate; unpublished.

## Decision and scope

Pin Electron exactly to `45.0.0-beta.1` (Chromium `156.0.8078.12`, Node.js `24.21.0`,
ABI `150`) in the desktop manifest and frozen pnpm lockfile. This gives AX Coder
native capabilities that were absent from the tested Electron 44.7.0 baseline.
It is a prerelease candidate, not a public release or a completed WebMCP provider.

Electron 45 stable is scheduled for October 20, 2026. Electron 46 alpha is scheduled
for October 22 and stable for January 5, 2027. These dates are upstream goals;
there is no qualified Electron 46 candidate here. Use observed native capabilities
to select a version rather than assuming a higher major guarantees compatibility.

The release contract now rejects floating Electron versions and blocks prerelease
Electron when public release is enabled, even after cutover approval. Two regressions
exercise those boundaries. The existing `shadow-only` policy stays disabled for public
release. Bundle identity, updater channel, user-data location, exact SDK `2.6.7`, and
signed worker pin `7.24.4` are preserved. macOS minimum metadata is explicitly `13.0`;
the existing Windows and Ubuntu Desktop 24.04+ x64/arm64 targets are retained.

The accepted source/runtime ownership decisions are unchanged. The separate embedded
WebMCP PRD/ADR proposals and earlier reference/research files are not included in this
commit. The application does not acquire a production WebMCP feature switch or new
permissions through this upgrade.

## Real native comparison

[Recorded evidence](electron-45-2026-10-11/native-evidence.json) includes a disabled
control and two enabled runs in separate processes for each engine, the exact engine
identities, official archive SHA-256 values, smoke source hashes, and the installed
Electron PTY/menu observation. All runs used macOS arm64.

| Controlled observation | Electron 44.7.0 / Chromium 152 | Electron 45 beta.1 / Chromium 156 |
| --- | --- | --- |
| Feature disabled: page API unavailable, no tools | Pass | Pass |
| Imperative and declarative tool discovery | Pass | Pass |
| Imperative invocation with structured CDP input/output | Pass | Pass |
| Declarative automatic and fixture-triggered manual submission | Pass | Pass |
| CDP cancellation returns `Canceled` | Pass | Pass |
| Execution receives a working cancellation `AbortSignal` | Not observed | Pass |
| Tool removal preserves an in-flight completion | Pass | Pass |
| CDP exposes the tool's `debugging` annotation | Not observed | Pass |
| Page `executeTool` accepts object input | Not accepted | Pass |
| Navigation empties the catalog and rejects stale tools | Pass | Pass |

The manual-submit test clicks a controlled fixture button using fixed test code;
it does not qualify real human interaction or production confirmation UX. Guests
use `WebContentsView`, sandboxing, context isolation, web security, no Node integration,
and denied permission requests. Profiles and the loopback HTTP fixture are disposable.
No installed Chrome, remote debugging port, polyfill, remote website, or broad experimental
web-platform switch is used. Only `--enable-features=WebMCP` is applied inside the smoke.

The disabled control shows that the CDP domain can exist while the page API is absent;
domain presence alone is not capability evidence. Neither engine emitted a `toolResponded`
event for a pending invocation during the recorded 500 ms after navigation. An earlier
strict terminal-event expectation timed out. Integration must
invalidate pending requests by document generation, bound waits, reject late results,
and avoid retrying uncertain effects; engine upgrade does not remove that obligation.

Electron 45 accepted object input through the page API but returned a JSON string in
this fixture, whereas CDP returned structured output. Do not infer identical return
formats between the two surfaces or silently change protocol schemas.

## Validation

| Check | Observed result |
| --- | --- |
| Frozen pnpm install | Pass; lockfile changes are limited to Electron |
| Clean serial Electron native extraction | Pass; extracted framework matches the installed framework and official archive checksum |
| Full desktop tests | 429 files passed; 2,933 tests passed, 1 existing skipped |
| Typecheck and lint | Pass |
| Repository boundaries and release contract | Pass |
| Locale completeness | 14 locales, 4,327 keys, 56,251 translated entries |
| Workflow syntax (`actionlint`) | Pass |
| Desktop production build | 3 tasks passed; native module rebuilt for Electron 45 |
| Real `node-pty` shell round trip under Electron ABI 150 | Pass |
| Actual Electron native menu construction in all 14 locales | Pass; localized roles and accelerators retained |
| Native engine smoke | Both engines passed disabled controls and repeated enabled checks |
| Local macOS arm64 package | Pass with `--publish=never`, no Developer ID signing/notarization |
| ASAR layout, anchor, runtime manifest, fuses | Pass; 281 JavaScript files packed, 76 renderer files, no loose Electron JavaScript |
| Packaged GUI startup and bundled AX Code runtime | Pass; bundled runtime reports `7.24.4` |
| Packaged ASAR CLI and HTTP renderer assets | Pass after test-only ad-hoc signing |
| Packaged macOS minimum version metadata | `LSMinimumSystemVersion = 13.0` |

The build retains its existing large-chunk warning; the test run includes unrelated
Vitest hoisting/deprecation warnings. A final syntax/lint check covers the added smoke launcher.
The existing packaged GUI smoke creates an isolated copy with an ad-hoc signature.
Directly launching the unsigned candidate's ASAR CLI initially received macOS `SIGKILL`
because packaging had changed its inherited signature. Ad-hoc signing the local test
candidate made strict signature verification and the ASAR CLI smoke pass. This is not
Developer ID, notarization, installer, updater, or release-signature evidence.

Electron's binary installation is lazy in this package. Initial parallel cold resolutions
failed extraction into the same generated directory, and a PTY smoke overlapping native
rebuild did not complete. Serialized extraction, ABI rebuild, and runtime smokes passed.
The compatibility launcher now has an external 25-second deadline in addition to the
Electron-side timeout. CI sequences install/rebuild/PTY/WebMCP rather than overlapping them.

Raw local logs, initial failed observations, original archive metadata, and generated
artifacts are retained under `.internal/reviews/electron-45-2026-10-11/`; they are not
source-controlled. The earlier generated macOS app was preserved and restored after
qualification. The new ad-hoc candidate is retained separately in that review directory.

## Runtime staging and remaining gates

The canonical worker repository is private. The existing required staging script's
anonymous GitHub release download received HTTP 404 and failed closed. This task does
not alter that download contract or inject credentials. For the local candidate, the
previously downloaded official `7.24.4` darwin-arm64 archive was freshly checked against
the pinned byte count/SHA-256 and Minisign key, extracted, and passed through the existing
development-only `AX_CODE_DIST` path. Its manifest was bound into ASAR, all 15 direct
runtime dependencies were checked, and the bundled worker actually started. This is
local verified-artifact packaging, not proof of the required release staging path.

Desktop CI now declares native PTY/menu/WebMCP jobs for macOS arm64, Windows x64/arm64,
and Ubuntu x64/arm64. Linux uses Xvfb and explicit runtime libraries without disabling
the Chromium sandbox. The workflow has passed syntax checks; these remote jobs have
not run in this repository and do not establish platform qualification.

Before public release: replace the beta with an exact tested stable pin, resolve the
private runtime download path within its release contract, run signed cross-platform
packaging, validate supported minimum OS versions and actual desktop environments,
and collect upgrade/rollback and provider integration evidence. None of those gates
are inferred from the local engine, menu, or startup tests.

Rollback to the previous exact Electron `42.5.2` pin requires restoring its lockfile
entries and rebuilding native modules for that ABI; it also loses the qualified native
WebMCP capability. Electron 44.7.0 remains the tested stable comparison point, not an
automatic downgrade or a second dependency installed by the app.

## Reproduction

```bash
pnpm install --frozen-lockfile
pnpm --filter @ax-code/electron run rebuild:native
pnpm run smoke:electron-compatibility
pnpm run smoke:native-webmcp -- --output-dir /path/to/candidate-evidence
node desktop/packages/electron/scripts/smoke-native-webmcp.mjs \
  --electron /absolute/path/to/electron-44.7.0 \
  --output-dir /path/to/baseline-evidence
pnpm run check:boundaries
pnpm run check:locales
pnpm run typecheck
pnpm run lint
pnpm run test
pnpm run build
```

Run native rebuild and engine smokes serially; use `xvfb-run -a` for Linux runtime smokes.
Windows and Linux observations must be collected on their corresponding hosts.

## Primary sources checked on October 11, 2026

- https://releases.electronjs.org/release/v45.0.0-beta.1
- https://releases.electronjs.org/release/v44.7.0
- https://releases.electronjs.org/schedule
- https://www.electronjs.org/blog/electron-44-0
- https://developer.chrome.com/docs/ai/webmcp/imperative-api
- https://raw.githubusercontent.com/ChromeDevTools/devtools-protocol/master/pdl/domains/WebMCP.pdl
