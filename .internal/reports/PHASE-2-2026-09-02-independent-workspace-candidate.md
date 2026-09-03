# Phase 2 Independent Workspace Completion Evidence

## Scope

This report records the Phase 2 implementation from initial workspace commit
`b3c24fd3cc8ece6a56b7720efcd36285d278a00e` through final implementation commit
`e0d0d69f0d3d4628ede504cdbfa3e3065320bbb9`. Phase 2 is complete. Phase 3 independent CI and release shadow remains
pending.

## Implemented boundary

- Generated a minimal pnpm/Turbo root for the three Desktop packages without importing the AX Code package graph.
- Replaced 191 current `@ax-code/sdk` references across 154 files with public
  `@defai-digital/ax-code-sdk` entrypoints. Historical changelog text remains unchanged.
- Removed the Vite alias to `packages/sdk/js/dist` and the automatic AX Code monorepo source launcher.
- Pinned SDK `2.2.0` and producer commit `1c3eb8cbfa1160c35ec3dbc8d05561b4df248d8c` in
  `config/ax-code-sdk.json`.
- Pinned AX Code runtime `7.10.2` for five platform targets by filename, size, SHA-256, signature size, signature
  SHA-256, repository, tag, Minisign key ID, and public-key digest in `config/ax-code-runtime.json`.
- Ported Desktop boundary, store-boundary, import-parser, and runtime-manifest checks from the source baseline.
  The runtime-manifest module preserves source blob `dc576f97a7ed16a7864f8ec2b5db971c9f6e0792` exactly.
- Preserved package, bundle, updater, data, and legacy compatibility identities during extraction.
- Kept AX Computer unreleased: the v7 package stages only its policy placeholder.

## Preliminary local SDK fixture

Before the first JSR publication, preliminary consumer validation used a one-time local tarball created from the exact
reviewed AX Code SDK producer commit. The two production package manifests were changed to the tarball path only for
`pnpm install --lockfile=false`, then immediately restored to the exact JSR specifier before all gates and before
commit.

The local tarball, dependency path, and generated installation are ignored and are not present in Git. The sibling
dependency check and staged-diff scan confirmed that no `file:`, temporary path, SDK source path, or AX Code source
dependency entered the candidate.

## JSR publication and production lock

AX Code tag `sdk-v2.2.0` resolves to producer commit `1c3eb8cbfa1160c35ec3dbc8d05561b4df248d8c`. The first tag-triggered
workflow passed every package gate but exposed a redundant pnpm argument separator before `--provenance`. Deno 2.6
enables provenance by default. AX Code commit `3bb0822ddf305cb5fda11fb9eb668f4bc14d8600` removed the stale flag and
locked the workflow test against disabling provenance.

GitHub Actions run [`33696640828`](https://github.com/defai-digital/ax-code/actions/runs/33696640828) then published
[`@defai-digital/ax-code-sdk@2.2.0`](https://jsr.io/@defai-digital/ax-code-sdk@2.2.0) successfully through OIDC.

AX Coder commit `26459b536015607b9e43d7c2c7e55f30e73e500d` committed `pnpm-lock.yaml`. Its SHA-256 is
`030e33457cf2af7d147ba637551a3b6d438dd43ab1c6daa87f6518845bdc2419`. Both consumers resolve the exact JSR version
to an `npm.jsr.io` tarball with SHA-512 integrity; the lock contains no temporary tarball, `file:` SDK, SDK source
path, or AX Code sibling dependency.

## Verification

| Gate                             | Result                                                                                   |
| -------------------------------- | ---------------------------------------------------------------------------------------- |
| JSR publication                  | OIDC workflow completed; tag and package version match the reviewed producer             |
| Frozen clean install             | Passed with lockfile resolution skipped and no AX Code sibling checkout                  |
| Desktop and ownership boundaries | Passed all eight commands; 2,693 files inspected by the clean-clone sibling check        |
| Root script tests                | 4 files, 32 tests passed                                                                 |
| Typecheck                        | Electron, UI, and web passed                                                             |
| Lint                             | Electron, UI, and web passed                                                             |
| Electron tests                   | 52 files, 383 tests passed                                                               |
| UI tests                         | 248 files, 1,577 tests passed                                                            |
| Web tests                        | 99 files, 788 passed and 1 skipped                                                       |
| Turbo build                      | 3 of 3 tasks passed, including Electron bundle and native `node-pty` rebuild             |
| Runtime staging                  | Size, SHA-256, signature size, signature SHA-256, and Minisign passed for macOS arm64    |
| Runtime binding                  | 1,707 non-native runtime entries bound into the trusted ASAR manifest                    |
| Unsigned macOS package           | Passed; 12 direct runtime dependencies verified                                          |
| Electron package audit           | 264 ASAR JavaScript files, zero loose Electron JavaScript, fuse and ASAR anchor passed   |
| Packaged ASAR CLI smoke          | Status, server startup, ASAR root, and hashed renderer asset passed                      |
| Packaged app smoke               | Stub lifecycle, utility-process recovery, bundled runtime `7.10.2`, and app smoke passed |

The first package attempt correctly exposed that the signed `v7.10.2` runtime predates archive-contained runtime
manifests. Staging now generates the manifest only after the archive and signature pass every checked-in integrity
gate and after unsafe symlinks are removed. Release-mode preparation still fails closed if that generated manifest is
absent.

Existing Vite dynamic/static import and large lazy Shiki chunk warnings match the source baseline. Turbo's missing
lockfile warning disappeared after the production lock was committed.

The production lock first exposed that the shared `desktop/postcss.config.js` plugin was only accidentally available
through the preliminary installation. The root workspace now declares `@tailwindcss/postcss` as the owner of that
shared build dependency. The headless macOS smoke also exposed an interactive Keychain wait before `app.ready`.
Commit `e0d0d69f0d3d4628ede504cdbfa3e3065320bbb9` gives only the isolated smoke profile Chromium's
`--use-mock-keychain`; production credential behavior is unchanged.

## Final clean-clone gate

A fresh clone of `e0d0d69f0d3d4628ede504cdbfa3e3065320bbb9`, placed under a parent with no AX Code sibling, passed
`pnpm install --frozen-lockfile`, all boundary checks, typecheck, lint, 32 root tests, 383 Electron tests, 1,577 UI
tests, 788 web tests with one skip, all three build tasks, signed-runtime staging, unsigned macOS arm64 packaging,
package audit, full packaged-app smoke, and packaged ASAR CLI smoke after local ad-hoc signing.

No public Desktop release, updater cutover, AX Code source deletion, or portfolio autonomy is authorized by Phase 2.
Those remain gated by Phases 3 through 8.
