# @ax-code/akitty-web provenance

AkiTTY Web is the in-app canvas terminal emulator for AX Code Desktop, part of the AkiTTY project (ADR-023). It
started as a copy of [coder/ghostty-web](https://github.com/coder/ghostty-web) v0.4.0, was developed in
`defai-digital/ax-code-desktop` (`desktop/packages/akitty-web`) and was migrated into this repository.

**It is no longer a tracked fork.** There is no upstream sync process, no byte-identical-to-upstream constraint on
`lib/`, and local changes are not logged here; use git history. This file only records where the starting point and the
binary artifacts came from, so the licenses stay correct and the wasm can be reproduced.

## Origin

| Part                             | Source                                                                              |
| -------------------------------- | ----------------------------------------------------------------------------------- |
| `lib/` (starting point)          | `coder/ghostty-web` tag `v0.4.0`, commit `9e4e126d89ac3537d2b2ebec075849851566de9f` |
| `LICENSE`                        | ghostty-web MIT license, Copyright (c) 2025 Coder                                   |
| `LICENSE-GHOSTTY`                | Ghostty MIT license at the commit below                                             |

Keep the Coder copyright and MIT notice for as long as any of that code remains.

## Wasm artifact

| Part                             | Source                                                                              |
| -------------------------------- | ----------------------------------------------------------------------------------- |
| `ghostty-vt.wasm`                | the published `ghostty-web@0.4.0` npm tarball; sha256 `d6f0326f1874ad2ce9f289e3a4a0c5f3507d4cb38d8747e4b287def470a0c60a` |
| `patches/ghostty-wasm-api.patch` | from the same commit; sha256 `ae5b1b034143885e130e5b795209c5bb52ce5987a62240bab1ac5ff4f99f430a` |
| Ghostty source of the wasm       | `ghostty-org/ghostty` commit `5714ed07a1012573261b7b7e3ed2add9c1504496`, Zig `0.15.2` |

The committed wasm is the release artifact above, not a local rebuild. `scripts/build-wasm.sh` fetches that Ghostty
commit, applies the patch and builds with Zig 0.15.2; a rebuilt file has not been compared byte for byte with the
committed one. When the patch, the Ghostty pin or the wasm changes, update the pins and hashes in this table in the
same commit.

## Package layout notes

- `package.json` exports the TypeScript source (`lib/index.ts`) and `ghostty-vt.wasm`; there is no prebuilt bundle and
  the wasm is not inlined as a `data:` URL.
- `happy-dom` is pinned to 21.0.4 to resolve GHSA-834v-8h66-3h79 in the test environment.
- Tests run under Vitest with Happy DOM. Older test files still import `bun:test`, which `test/bun-test-shim.ts` maps
  onto Vitest.
