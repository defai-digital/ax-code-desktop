# Latest runtime pin after Desktop v7.30.1 publication

Desktop v7.30.1 was published at 2026-10-26T10:41:12Z from 3942df727dbd9f22ccec7ba96f8058672cc1c51f with the latest stable runtime at its tag cut, CLI/TUI 7.30.0 and matched SDK 2.6.52. Producer CLI/TUI 7.30.1 became public at 10:44:48Z; SDK 2.6.53 was published at 10:31:20Z. The user explicitly required the latest CLI/TUI pin, so main is advanced to those newly published, independently verified inputs.

All four runtime archives and detached Minisign signatures match live GitHub size/SHA-256 metadata and the existing pinned key. The public key is unchanged. SDK 2.6.53 is pinned exactly at producer tag sdk-v2.6.53 / commit 1bb23034db3a0b2067579a510cd30dd6151449e2, installed with pnpm, with a generated lockfile and fresh authenticated registry integrity verification. Release-version fixture assertions are updated to the new runtime/SDK contract.

The local CLI was upgraded using the verified official installer with an explicit 7.30.1 version, no shell-profile modifications and no optional engine installation. Its installed TUI application bundle is checked byte-for-byte against the signed producer archive. Existing installed versions and user data are preserved.

The existing published Desktop v7.30.1 tag/assets remain immutable under ADR-012. This main-branch pin update does not replace that release's runtime or reuse its qualification receipts. A new Desktop version and its own signed/native qualification are required before distributing the upgraded bundle. The user has been asked to choose a new Desktop v7.30.2 release or a main-only update; no new public version is authorized merely by elapsed time.

Verification logs, producer metadata, signature checks, installed bundle identity and compatibility results are retained under .internal/releases/latest-cli-7.30.1-operator/ and .internal/releases/latest-cli-7.30.1-evidence/.

## Compatibility verification

Source commit: `7344597ea6ad3267d5180bed7e015c45dc68321b`. All six required local gates passed: 8,203 tests passed, 10 skipped. Four fresh native UI journeys passed with DOM/screenshot evidence and no CSP/renderer errors. Canonical and isolated frozen installs both passed. The official installer reported CLI/TUI 7.30.1; installed bundle SHA-256 is `164e148f04dbe3364f14009189a3fc06ea67e091466d580426ead254a229dd98`, matching the signed producer archive.

[Desktop CI](https://github.com/defai-digital/ax-code-desktop/actions/runs/40312589845) passed all 11 jobs, with 8,205 tests passed and 7 skipped. All 18 downloaded operation-journey groups / 72 checks and packaged/unpackaged renderer checks passed. [CodeQL](https://github.com/defai-digital/ax-code-desktop/actions/runs/40312589822) and [Code Quality](https://github.com/defai-digital/ax-code-desktop/actions/runs/40312590120) passed; zero open Code Scanning/Dependabot alerts and production audit vulnerabilities. SDK registry integrity, producer tag/commit, all runtime artifact hashes/signatures and source-bound lockfile checks passed.

The temporary pin branch/worktree was merged into main and removed through ordinary non-force cleanup after process ownership and 63,470-file inventory checks. Only canonical main remains; user/session/release evidence is preserved. This is main-branch compatibility validation, not a replacement native installer qualification for published Desktop v7.30.1. A new distribution version still requires its own signed Shadow/install/upgrade/rollback qualification.

Local verification receipt SHA-256: `72eda61903ff1db999a552aa738f373d56ac2982bba8770b550751f5ccc33e9a`. Hosted verification receipt SHA-256: `404b8fc13edeef94e6d64248acbd42307048c61e332441d2638adb01a4cd65e9`. Cleanup receipt SHA-256: `43469d5e0f96dcefc60e22a2aa2044e23552ed00ea2c7b94d0c9752721c8964b`.
