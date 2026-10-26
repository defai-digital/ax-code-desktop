# Latest runtime pin after Desktop v7.30.1 publication

Desktop v7.30.1 was published at 2026-10-26T10:41:12Z from 3942df727dbd9f22ccec7ba96f8058672cc1c51f with the latest stable runtime at its tag cut, CLI/TUI 7.30.0 and matched SDK 2.6.52. Producer CLI/TUI 7.30.1 became public at 10:44:48Z; SDK 2.6.53 was published at 10:31:20Z. The user explicitly required the latest CLI/TUI pin, so main is advanced to those newly published, independently verified inputs.

All four runtime archives and detached Minisign signatures match live GitHub size/SHA-256 metadata and the existing pinned key. The public key is unchanged. SDK 2.6.53 is pinned exactly at producer tag sdk-v2.6.53 / commit 1bb23034db3a0b2067579a510cd30dd6151449e2, installed with pnpm, with a generated lockfile and fresh authenticated registry integrity verification. Release-version fixture assertions are updated to the new runtime/SDK contract.

The local CLI was upgraded using the verified official installer with an explicit 7.30.1 version, no shell-profile modifications and no optional engine installation. Its installed TUI application bundle is checked byte-for-byte against the signed producer archive. Existing installed versions and user data are preserved.

The existing published Desktop v7.30.1 tag/assets remain immutable under ADR-012. This main-branch pin update does not replace that release's runtime or reuse its qualification receipts. A new Desktop version and its own signed/native qualification are required before distributing the upgraded bundle. The user has been asked to choose a new Desktop v7.30.2 release or a main-only update; no new public version is authorized merely by elapsed time.

Verification logs, producer metadata, signature checks, installed bundle identity and compatibility results are retained under .internal/releases/latest-cli-7.30.1-operator/ and .internal/releases/latest-cli-7.30.1-evidence/.
