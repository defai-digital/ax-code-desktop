# AkiTTY Web provenance

Version 0.6.12 uses the AkiTTY-owned Rust engine in `../../crates/akitty-vt`, compiled
into `akitty-vt.wasm`. No Ghostty, Alacritty or VTE implementation is built or
bundled. `wasm-provenance.json` records the exact artifact SHA-256, pinned compiler
and source/build input hashes. `scripts/build-wasm.sh` builds those local sources;
it does not fetch a terminal project or apply an upstream patch.

The native 1.4.1 workspace version rebuilds the artifact with Rust 1.99.1. Its SHA-256 is
`47fd26cb98997b40b8353b288f23f820ec0a591bcdba35b909ea977c106bc946`;
the matching workspace and engine input hashes are in `wasm-provenance.json`.

## Current implementation

- Parser, grid/history, terminal state, queries and key encoding: independently
  authored `akitty-vt`, shared with native AkiTTY, MIT.
- Production `lib/` terminal/engine bindings, input/mouse, rendering, selection,
  buffer views, links/providers, fit, events, types and public entry points:
  independently reauthored AkiTTY implementations, MIT.
- `lib/agent`: existing AkiTTY read-only host integration, MIT.
- `lib/*.test.ts`, addon/agent tests and `lib/test-helpers.ts`: retained regression
  contracts, including Coder-derived tests/helpers. Original Coder MIT notice is
  retained in `LICENSE`. AkiTTY additions and changes are covered by its MIT notice.
- Ordinary Rust dependencies: locked Unicode width/segmentation and base64
  libraries, retaining their respective licenses. See the engine ownership ledger
  at `../../third_party/TERMINAL_ENGINE.md` for versions and protocol data.

## Historical origin

Before 0.6 this package started from `coder/ghostty-web` tag `v0.4.0`, commit
`9e4e126d89ac3537d2b2ebec075849851566de9f`, and was developed in
`defai-digital/ax-code-desktop` before moving here. The former Ghostty binary was
built from commit `5714ed07a1012573261b7b7e3ed2add9c1504496` plus an AkiTTY patch.
The binary, patch and inherited production implementation have been removed.
Git history preserves their original provenance. `LICENSE-GHOSTTY` is retained
as a historical notice, not as attribution for the new engine. Nothing syncs from
these projects. AX Code Desktop's separate copy is not updated by this repository.

## Build verification

From the repository root, run:

```sh
bash packages/akitty-web/scripts/build-wasm.sh
python3 scripts/vt-provenance.py --write
python3 scripts/check-engine-source.py
node scripts/test-vt-wasm.ts packages/akitty-web/akitty-vt.wasm
```

Rust 1.99.1 is pinned. Use its `wasm32-unknown-unknown` target, or matching Rust
sources plus `wasm-ld` for the distribution-toolchain fallback. Build output can
differ between standard-library/linker distributions; the manifest identifies
one exact committed artifact. The required gate verifies that artifact and tests
a fresh build separately, rather than asserting cross-toolchain byte identity.
