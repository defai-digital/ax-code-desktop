# Runtime 7.27.6 and SDK 2.6.37 adoption

Date: 2026-10-19

AX Code Desktop now consumes the published AX Code runtime 7.27.6 and exact JSR SDK 2.6.37. The Electron, UI, and web manifests, frozen lockfile, runtime artifact inventory, producer commit, and contract tests agree. Desktop's independent app version remains 7.27.2.

## Published inputs

- Release: https://github.com/defai-digital/ax-code/releases/tag/v7.27.6
- Annotated tag `v7.27.6` (`4215ea778a6ca61b298f6b063bfc303d2243da0c`) resolves to producer commit `7e0ba70303efa993021a4887e958e91cc51b1cc3`. The `sdk-v2.6.37` publish tag resolves to the same commit, and its "Publish SDK to JSR" workflow completed successfully.
- SDK metadata: https://npm.jsr.io/@jsr/defai-digital__ax-code-sdk — the lockfile integrity for 2.6.37 matches the registry record.
- All four pinned archives were downloaded. Their sizes and SHA-256 hashes match the public asset inventory; detached minisign signatures pass against the existing repository public key, and the trusted comments name the same SHA-256 values. The release's `ax-minisign.pub` is byte-identical to the pinned key (`sha256 41de2e31…`).

`public-release.json` records the public inventory. `verification.json` records the artifact checks, SDK metadata, and changed-file hashes. Downloaded archives remain outside the repository in the adopting session's scratchpad.

## Validation

| Check | Result |
| --- | --- |
| `pnpm install` (lockfile update) | Passed; SDK 2.6.37 resolved with registry integrity |
| `pnpm run check:boundaries` | Passed: runtime pin 7.27.6 (4 targets), release policy, release contract |
| `pnpm run typecheck` | Passed |
| `pnpm run lint` | Passed |
| `pnpm run test` (scripts + electron + ui + web) | Passed: 212 + 649 + 3441 + 1434 tests, 10 skipped |
| Downloaded Darwin ARM64 runtime `--version` | 7.27.6 |
| Actual SDK 2.6.37 with signed native runtime 7.27.6 | Health, capabilities, and command catalog passed |

`verify-sdk-runtime.mjs` uses an isolated temporary configuration and loopback server with the downloaded runtime on PATH. It makes no model request and closes the server after checking. `native-sdk-smoke.json` records the successful result. Rerunning requires dependencies and the downloaded archive extraction at the recorded path.

Hardcoded version expectations were updated in `script/runtime-pin.test.mjs`, `script/desktop-release-contract.test.mjs`, `script/shadow-release-evidence.test.mjs`, `desktop/packages/electron/scripts/stage-ax-code.test.mjs`, and `desktop/packages/electron/scripts/smoke-packaged-app.test.mjs`.

## Changes in scope

Runtime 7.27.6 resolves symbolic branch names, serializes branch refreshes and keeps the known branch on git failures, fixes unterminated bracketed paste and SS3 cursor-key parsing, replaces the whole completion token, contains packaged archive extraction, tightens release governance checks, and refreshes the model snapshot.

The only SDK contract change is `VcsInfo.branch` becoming optional. Desktop already treats `vcs` as possibly undefined and compares `draft.vcs?.branch`, so no source change was needed; typecheck confirms it.

Linux and Windows signatures were verified, but their binaries were not executed on this Mac. This report is not signed Desktop installation, upgrade, or rollback qualification. No user application was replaced, no commit was pushed, and no release was published or modified.
