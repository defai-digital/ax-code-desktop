# Electron 46 alpha candidate review

Date: 2026-11-12.
Baseline: `4e74d76fe8585e2071fffd0b103abdcbd2f964d7`, Electron `45.2.3`.
Scope: The user requested review and a trial upgrade to Electron 46 Alpha.
Status: Implemented and locally validated on macOS arm64; public release disabled.

## Changes and release policy

Pin Electron to `46.0.0-alpha.9` in the package manifest and pnpm-generated lockfile.
The registry's alpha tag and the [official release record](https://releases.electronjs.org/release/v46.0.0-alpha.9)
both selected this exact version on the review date. A frozen installation succeeded with the existing SDK pin.
pnpm also regenerated optional peer snapshot links and removed Electron's unused Node 24 type dependencies.

The existing release contract rejects prerelease Electron while public release is enabled. Set the candidate policy
to `shadow-only` with `publicRelease.enabled: false`; preserve the recorded cutover evidence and release guard code.
Packaging must use `--publish=never`. Restore a separately validated stable Electron pin before re-enabling public
release. The user subsequently authorized committing and pushing this validated candidate. Public release remains disabled.

Release-policy tests now assert that the current candidate blocks public publishing. Tests of authorized distribution
and invalid cutover records use explicit authorized fixtures, so they remain independent of the checkout's stage.
The full UI gate exposed a fixture race: overlapping model-status requests reused one pending `Response`, allowing
one reader to consume another reader's body. Clone the pending response for each simulated fetch. The existing
host-switch test exercises this path; no application behavior or response validation was weakened.

## Review of the proposed benefits

The installed macOS arm64 engine reports Electron `46.0.0-alpha.9`, Chromium `159.0.8153.0`, Node `26.13.0`,
V8 `15.9.122.1-electron.4368b3a10ddc62be`, and native module ABI `154`.

| Claim | Finding |
| --- | --- |
| Node 26.13.0 Lithium is LTS through April 2029 | Correct for Node's release line. Its release notes describe an LTS metadata transition from 26.12.1; this does not give Electron Alpha an LTS support commitment. |
| Electron uses V8 14.6 | Incorrect. That is the standalone Node 26 release lineage; this Electron build reports V8 15.9. |
| Temporal, Map upsert, and Iterator sequencing | Present in the actual main process. Temporal is also present in the sandboxed renderer. No application performance benefit was measured. |
| Web Storage automatically unifies main and renderer state | Unsupported. With default launch options, main-process `localStorage` is undefined and warns about a missing `--localstorage-file`; `sessionStorage` exists. Node storage does not establish shared renderer-origin storage. |
| `--allow-net` automatically restricts the Electron application | Unsupported. Node requires explicit permission-model activation, and Electron supports only a subset of Node switches. No enforcement was configured or qualified here. |
| Clipboard modernization is new in Electron 46 | Incorrect. The async clipboard redesign is documented under Electron 44. The existing renderer uses `navigator.clipboard`, including awaited text reads/writes. |
| Windows menu colors and extension sync require Electron 46 | Incorrect. Both shipped in 45.2.0 and are already in the 45.2.3 baseline. Electron's `storage.sync` is a second local area, with no cross-device synchronization. |
| Managed extension storage and stability fixes are exclusive to 46 | Incorrect. Alpha.8 marks managed storage as also in 45, the notification-quit fix as also in 44, and redirect-loop fixes as also in 43/44/45. Backports must be checked individually. |
| Chromium 159 guarantees speech-result timestamps | Not available in this default Electron build: neither `speechStartTime` nor `speechEndTime` exists on `SpeechRecognitionResult.prototype`. Recognition constructor presence does not qualify a working recognition service. |
| Extended Canvas text metrics are available by default | Not available in this default build: `getSelectionRects`, `getActualBoundingBox`, and `getTextClusters` are undefined. |
| The candidate is faster, uses less memory, or includes every Q3/Q4 security fix | Not established by these sources or tests. An alpha engine version and functional smokes do not establish those claims. |

Repository inspection found no Chrome extension loading, Web Speech integration, removed synchronous safeStorage calls,
or `--experimental-transform-types` launch flag in the inspected application paths. The preload bundles its local
helpers and exposes only approved Electron IPC. The existing utility-process stop path already requests graceful
shutdown before escalation. These findings do not authorize new product features or runtime permissions.

## Verification

| Check | Result |
| --- | --- |
| Frozen dependency installation | Passed with the pinned SDK `2.6.69`. |
| Root gates | `check:boundaries`, `check:locales`, `typecheck`, `lint`, `test`, and `build` all passed. |
| Full test suite | 9,513 passed, 12 skipped across root tooling and the four packages. |
| Native module rebuild | `node-pty` rebuilt successfully for Electron `46.0.0-alpha.9`, ABI `154`. |
| Native compatibility smoke | All 14 locale menus and a real PTY round trip passed. |
| Native WebMCP smoke | Feature-disabled, feature-enabled, and enabled-repeat cases passed. |
| macOS arm64 directory packaging | Passed with signing and notarization disabled and `--publish=never`; the pinned runtime was required and verified. |
| Packaged runtime and app smoke | Passed with the bundled AX Code runtime `7.30.24`. |
| Packaged E2E | All 10 checks passed: boot, preload bridge, Settings, supervision pop-out, reload, approval, denial, goal-row updates, CSP, and renderer exceptions. |
| Rendered evidence | Inspected the final E2E screenshot: the workspace, composer, project, and updated goal row rendered. |

Retained receipts: [workspace gates and test counts](electron-46-20261112/workspace-gates.json),
[runtime feature observations](electron-46-20261112/features.json),
[native menus and PTY](electron-46-20261112/native-compatibility.json),
[native WebMCP](electron-46-20261112/native-webmcp-summary.json),
[packaged smoke](electron-46-20261112/packaged-smoke.txt), and
[packaged E2E results](electron-46-20261112/packaged-e2e-results.json).
Raw logs and screenshots are under `/tmp/ax-desktop-electron-46-alpha9-20261112`.
The isolated test app is at `package/mac-arm64/AX Code.app` under that directory.

These checks establish local macOS compatibility for this exact candidate. Windows/Linux execution,
signing/notarization, upgrade/rollback, and performance comparisons remain unverified. Production qualification
requires a separately validated stable pin and explicit release authorization.

## Sources checked

- [Electron alpha.9 engine identities and changes](https://releases.electronjs.org/release/v46.0.0-alpha.9)
- [Electron alpha.1 breaking changes](https://releases.electronjs.org/release/v46.0.0-alpha.1)
- [Electron alpha.8 features, fixes, and backports](https://releases.electronjs.org/release/v46.0.0-alpha.8)
- [Electron 45.2.0 features and DevTools fixes](https://releases.electronjs.org/release/v45.2.0)
- [Electron breaking-change guide](https://www.electronjs.org/docs/latest/breaking-changes/)
- [Electron's supported command-line switches](https://www.electronjs.org/docs/latest/api/command-line-switches)
- [Node 26.13.0 LTS transition](https://nodejs.org/en/blog/release/v26.13.0)
- [Node 26.0.0 features and removals](https://nodejs.org/en/blog/release/v26.0.0)
- [Node permission model](https://nodejs.org/api/permissions.html)

The Web Speech specification defines timestamps, but a specification alone does not prove that this engine exposes
them. The runtime observations above use an isolated sandboxed window without experimental web-platform flags.
