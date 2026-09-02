# Independent Workspace Candidate Evidence

## Scope

This report records the local Phase 2 candidate at
`b3c24fd3cc8ece6a56b7720efcd36285d278a00e`. It does not mark Phase 2 complete because the first JSR version and
the resulting frozen production lockfile are still pending.

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

## Local SDK fixture

The JSR package currently has zero published versions. Consumer validation therefore used a one-time local tarball
created from the exact reviewed AX Code SDK producer commit. The two production package manifests were changed to the
tarball path only for `pnpm install --lockfile=false`, then immediately restored to the exact JSR specifier before all
gates and before commit.

The local tarball, dependency path, and generated installation are ignored and are not present in Git. The sibling
dependency check and staged-diff scan confirmed that no `file:`, temporary path, SDK source path, or AX Code source
dependency entered the candidate.

## Verification

| Gate                             | Result                                                                                   |
| -------------------------------- | ---------------------------------------------------------------------------------------- |
| Desktop and ownership boundaries | Passed all eight commands; 2,696 files inspected by the sibling check                    |
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
| Packaged app smoke               | Stub lifecycle, utility-process recovery, bundled runtime `7.10.2`, and app smoke passed |

The first package attempt correctly exposed that the signed `v7.10.2` runtime predates archive-contained runtime
manifests. Staging now generates the manifest only after the archive and signature pass every checked-in integrity
gate and after unsafe symlinks are removed. Release-mode preparation still fails closed if that generated manifest is
absent.

Existing Vite dynamic/static import and large lazy Shiki chunk warnings match the source baseline. Turbo's missing
lockfile warning is expected until the JSR publication gate below closes.

## Remaining Phase 2 gate

1. Publish immutable `@defai-digital/ax-code-sdk@2.2.0` from reviewed AX Code tag `sdk-v2.2.0` through GitHub OIDC.
2. Replace the local installation with `pnpm install` against JSR and commit the resulting lockfile.
3. Verify a fresh clone with no AX Code sibling using `pnpm install --frozen-lockfile`, boundaries, typecheck, lint,
   tests, build, unsigned package, and packaged smoke.

No public Desktop release, updater cutover, AX Code source deletion, or portfolio autonomy is authorized by this
candidate.
