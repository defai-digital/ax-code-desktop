# Latest runtime pin after Desktop v7.30.11 publication

Desktop v7.30.11 shipped with runtime CLI/TUI 7.30.1 and SDK 2.6.53, thirteen producer patch releases behind. Main is advanced to the latest stable producer inputs: CLI/TUI 7.30.14 (tag v7.30.14, published 2026-11-01T21:27:33Z) and SDK 2.6.67 (tag sdk-v2.6.67 / commit fbc1e27023f7aaaba421e6b63fa223b87c4dd25e, published 2026-11-01T21:34:46Z).

All four runtime archives and detached Minisign signatures were downloaded, verified with `minisign -V` against the pinned key, and matched to live GitHub size/SHA-256 metadata. The public key (`ax-minisign.pub`, sha256 41de2e31…397b2) is unchanged. SDK 2.6.67 is pinned exactly and installed with pnpm through an authenticated, uncommitted user-level registry config; the lockfile is generated.

The SDK contract delta from 2.6.53 is additive (new optional config/provider/risk fields, `directory` on scheduled-task deletion events, typed MCP error envelopes, `%` now encoded by the directory-header encoder). Reviewing it found a pre-existing Desktop defect: renderer settings stores sent the raw project path in `x-ax-code-directory`, which fetch rejects for characters above U+00FF, and the Desktop server never decoded the header. It is fixed in a separate commit with a shared `encodeDirectoryHeader` matching the runtime contract and a server-side `readDirectoryHeader`.

Verification on this tree: `pnpm run typecheck`, `pnpm run check:boundaries` (release contract reports runtime 7.30.14 / SDK 2.6.67), `pnpm run test` (all script and package suites pass), an unsigned local darwin-arm64 package whose stage step minisign-verified and manifest-authenticated runtime v7.30.14, `pnpm run smoke:packaged` with `AX_CODE_STAGE_REQUIRED=true` (bundled runtime v7.30.14 passed), and `pnpm run e2e:desktop` on that package (10/10 checks passed).

This is a main-branch pin update. Published Desktop v7.30.11 assets remain immutable under ADR-012; distributing the upgraded runtime requires a new Desktop version with its own signed/native qualification.
