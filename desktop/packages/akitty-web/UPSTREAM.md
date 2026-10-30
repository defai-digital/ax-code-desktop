# @ax-code/akitty-web upstream record

AkiTTY Web is AX Code Desktop's in-app terminal emulator, part of the AkiTTY project and derived from ghostty-web
(ADR-023). This file records where every part came from and
what was changed, so a later sync can be reviewed as a diff against upstream.

## Baseline

| Part                            | Source                                                                         |
| ------------------------------- | ------------------------------------------------------------------------------ |
| `lib/`                          | `coder/ghostty-web` tag `v0.4.0`, commit `9e4e126d89ac3537d2b2ebec075849851566de9f` |
| `patches/ghostty-wasm-api.patch` | same commit; sha256 `ae5b1b034143885e130e5b795209c5bb52ce5987a62240bab1ac5ff4f99f430a` |
| `ghostty-vt.wasm`               | the published `ghostty-web@0.4.0` npm tarball; sha256 `d6f0326f1874ad2ce9f289e3a4a0c5f3507d4cb38d8747e4b287def470a0c60a` |
| Ghostty source of the wasm      | `ghostty-org/ghostty` commit `5714ed07a1012573261b7b7e3ed2add9c1504496` (the v0.4.0 submodule pin), Zig `0.15.2` |
| `LICENSE`                       | ghostty-web MIT license, Copyright (c) 2025 Coder                              |
| `LICENSE-GHOSTTY`               | Ghostty MIT license at the commit above                                        |

The committed wasm is the upstream release artifact, not a local rebuild. `scripts/build-wasm.sh` reproduces the
upstream build from the pins above; a rebuilt file has not yet been compared byte-for-byte with the committed one.

## Local changes

`lib/` and the patch are byte-identical to the baseline. Everything else is Desktop-owned:

- `package.json`: renamed to `@ax-code/akitty-web`, private, and exports the TypeScript source (`lib/index.ts`) instead of
  a prebuilt bundle, so the renderer build compiles it. The npm bundle inlined the wasm as a `data:` URL; the source
  build does not, which removed about 565 KB from the renderer's terminal chunk.
- `tsconfig.json`, `types/runtime-globals.d.ts`: type-check without `bun-types`.
- `vitest.config.ts`, `test/bun-test-shim.ts`, `test/setup.ts`: run the upstream `bun:test` suite under Vitest with
  Happy DOM. `test/setup.ts` is derived from upstream `happydom.ts` (canvas mock kept, Bun preload removed).
- `scripts/build-wasm.sh`: derived from upstream; fetches the pinned Ghostty commit into a temporary directory
  instead of using a git submodule, and refuses a different Zig version.

Not carried over: Bun lockfile and config, Biome, release-please, demo, bench, and upstream CI.

Record every future modification of `lib/` or the patch here, with the reason.

## Syncing from upstream

1. Diff the upstream range against the baseline commit and review each commit; take fixes deliberately rather than
   copying the whole tree.
2. Apply the chosen changes to `lib/` and, when the wasm API changes, to the patch.
3. If the patch or Ghostty pin changed, run `pnpm --dir desktop/packages/akitty-web run build:wasm` and record the new
   sha256 above.
4. Run this package's `type-check` and `test`, the UI terminal tests, and `pnpm run build`.
5. Update the baseline table, this package's version (`0.4.0-ax.N`), and the NOTICE entries.

## Upstream commits after the baseline (not yet reviewed)

As of 2026-10-29, `coder/ghostty-web` `main` (`640db46`) is 21 commits past `v0.4.0` with no newer stable release.
Candidates worth reviewing first: `fc99955` (crash on resize during high output), `bec9e16` (clear scrolled row cells
in the wasm patch), `24b3c80` (echo latency), `03ead6e` (mouse tracking), `6a1a50d` (selection), `3525675` (OSC 8 link
clicks), `fd09412` (clipboard overwrite on single click), `98753e0` (Shift+Tab), `65aeac9` (bracketed paste check),
`c7e37fb` and `2ede417` (terminal responses from the wasm).
