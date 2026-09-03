# Phase 3 Shadow Release Implementation Evidence

> Later status note: ADR-008 separately authorized the local source-ownership cutover after this report was written.
> The final Phase 4 paragraph below is historical. Current source and release state is recorded in
> `PHASE-4A-2026-09-02-local-source-cutover.md`.

## Scope

This report records the local Phase 3 implementation at
`6e0ce9438cf6f9087930a53f3bde13ee2896feda`. It does not mark Phase 3 complete. AX Coder has no configured remote,
so the cross-platform workflow, real signing identities, upgrade, data continuity, and rollback have not run.

No tag, GitHub Release, public update metadata, public Desktop artifact, remote repository, or external release state
was created or changed.

## Implemented workflows

- `.github/workflows/desktop-ci.yml` runs frozen install, ownership/release boundaries, typecheck, lint, tests, build,
  and an isolated unsigned macOS packaged-app smoke.
- `.github/workflows/codeql.yml` scans JavaScript, TypeScript, and Actions. It does not retain the AX Code Rust job.
- `.github/workflows/desktop-shadow.yml` is manual-only and requires an explicit shadow-only acknowledgement. It
  refuses to retain installers unless the repository is private and has read-only repository permissions.
- The shadow matrix covers web, macOS arm64, Windows x64/arm64, and Linux x64/arm64.
- Unsigned mode requires no signing secret. Required mode fails closed on Developer ID/notarization, Authenticode, or
  detached Minisign configuration and verification failure.
- Platform jobs upload one-day staging artifacts. The finalizer applies the detached-signature policy, verifies one
  source/version/signing set, and retains the combined candidate for seven days as a GitHub Actions artifact only.

## Release and identity gates

`config/desktop-release-policy.json` declares `shadow-only` and disables public release. The Electron package wrapper
requires exactly one `--publish=never` argument. The retained legacy publisher invokes the public-release policy gate
before parsing release options, touching Git, or contacting GitHub.

`config/desktop-identity.json` freezes the compatibility values for product name, bundle ID, artifact name, renderer
origin, package and command names, updater repository and tag prefix, Apple and Windows signing identity, Minisign
Keychain identifiers, and source extraction commits. `script/desktop-release-contract.mjs` binds those values to the
actual package, Electron Builder, updater, renderer, signing, runtime, SDK, lockfile, and workflow sources.

The evidence pipeline records only selected non-secret CI metadata. For every target it includes the full source
commit, clean-tree state, source extraction mapping digest, lock digest, exact JSR SDK producer, signed runtime pin,
frozen identity, required checks, and artifact sizes and SHA-256 digests. Required mode also demands detached signature
coverage for every artifact. The summary rejects cross-target source, version, signing-mode, or publication drift.

## Local verification

| Gate                              | Result                                                                                  |
| --------------------------------- | --------------------------------------------------------------------------------------- |
| Workflow syntax                   | `actionlint` passed all three workflows                                                 |
| Shell scripts                     | `shellcheck` passed the new signer and guarded legacy publisher                         |
| Root script tests                 | 11 files, 58 tests passed                                                               |
| Desktop tests                     | Electron 383; UI 1,577; web 788 passed with one skip                                    |
| Typecheck and lint                | Electron, UI, and web passed                                                            |
| Desktop build                     | Three Turbo tasks passed                                                                |
| Web package                       | `pnpm pack` produced one tarball; collector normalized it to the shadow artifact name   |
| macOS runtime staging             | Signed AX Code v7.10.2 archive verified; 1,707 authenticated runtime entries            |
| macOS unsigned package            | DMG, ZIP, both blockmaps, and `latest-mac.yml` collected                                |
| macOS package integrity           | 12 runtime dependencies; 264 ASAR JS files; 59 renderer files; no loose Electron JS     |
| macOS packaged app and ASAR smoke | Bundled runtime v7.10.2, app lifecycle/recovery, ASAR root, and hashed asset all passed |
| Local evidence generation         | Five artifacts recorded with public release disabled                                    |

Existing Vite dynamic/static import and large Shiki chunk warnings match the Phase 2 baseline.

## Remaining Phase 3 gates

1. Create or select the authorized private AX Coder GitHub repository and configure its remote without changing public
   Desktop ownership.
2. Configure the existing approved Apple, Azure, and Minisign secret references in its CI environment.
3. Run unsigned and required-signing shadow workflows across every target and retain the generated evidence set.
4. Run clean install, signed application identity, Keychain/TCC or platform credential, sleep/resume, restart,
   terminal, settings, scheduler, and runtime compatibility checks on supported platforms.
5. Exercise upgrade from the last AX Code-owned Desktop release and a non-lossy rollback to the last verified
   compatible release.

Phase 4 remains unauthorized. AX Code stays the public Desktop source and release owner, and its Desktop source must
not be removed.
