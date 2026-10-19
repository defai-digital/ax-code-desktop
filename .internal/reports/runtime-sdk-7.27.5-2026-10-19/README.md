# Runtime 7.27.5 and SDK 2.6.36 adoption

Date: 2026-10-19

AX Code Desktop now consumes the published AX Code runtime 7.27.5 and exact JSR SDK 2.6.36. The Electron, UI, and web manifests, frozen lockfile, runtime artifact inventory, producer commit, and contract tests agree. Desktop's independent app version remains 7.27.2.

## Published inputs

- Release: https://github.com/defai-digital/ax-code/releases/tag/v7.27.5
- Annotated tag `v7.27.5` (`718509193e754f335399ae808390703bee1d641f`) resolves to producer commit `2703c67229b1e063416bb3e512cbcfaa5dddc597`.
- SDK metadata: https://npm.jsr.io/@jsr/defai-digital__ax-code-sdk — the lockfile integrity for 2.6.36 matches the registry record.
- All four pinned archives were downloaded. Their sizes and SHA-256 hashes match the public asset inventory; detached minisign signatures pass against the existing repository public key, and the trusted comments name the same SHA-256 values. The release's `ax-minisign.pub` is byte-identical to the pinned key (`sha256 41de2e31…`).
- The direct JSR version metadata endpoint was not used; the official JSR npm compatibility registry supplied the published metadata and integrity consumed by pnpm.

`public-release.json` records the public inventory. `verification.json` records the artifact checks, SDK metadata, and changed-file hashes. Downloaded archives remain outside the repository at `/tmp/ax-7.27.5`.

## Validation

| Check | Result |
| --- | --- |
| `pnpm install` (lockfile update) | Passed; SDK 2.6.36 resolved with registry integrity |
| `pnpm run test:scripts` | 210 passed, 7 skipped |
| `pnpm run test` (scripts + electron + ui + web) | Passed, exit 0 |
| `pnpm run typecheck` | Passed |
| `pnpm run lint` | Passed |
| `pnpm run check:boundaries` | Passed: runtime pin 7.27.5 (4 targets), release policy, release contract (app 7.27.2, SDK 2.6.36, runtime 7.27.5) |
| Downloaded Darwin ARM64 runtime `--version` | 7.27.5 |
| Actual SDK 2.6.36 with signed native runtime 7.27.5 | Health, capabilities, and command catalog passed |

`verify-sdk-runtime.mjs` uses an isolated temporary configuration and loopback server with the downloaded runtime on PATH. It makes no model request and closes the server after checking. `native-sdk-smoke.json` records the successful result. Rerunning requires dependencies and the downloaded archive extraction at the recorded temporary path.

Hardcoded version expectations were updated in `script/runtime-pin.test.mjs`, `script/desktop-release-contract.test.mjs`, `script/shadow-release-evidence.test.mjs`, `desktop/packages/electron/scripts/stage-ax-code.test.mjs`, and `desktop/packages/electron/scripts/smoke-packaged-app.test.mjs` before the final suite.

## Feature boundary

Runtime 7.27.5 ships the `analysis-output` builtin skill and the `merge-and-sync-github` command; the live command-catalog smoke confirms both the runtime version and the presence of `analysis-output`. Unlike the 7.27.4 pin, this update **does** deliver the analysis-output builtin to packaged users (the gap recorded in [the 7.27.4 adoption report](../runtime-sdk-7.27.4-2026-10-18/README.md) is closed). SDK 2.6.36 adds local Git branch enumeration.

Linux and Windows signatures were verified, but their binaries were not executed on this Mac. This report is not signed Desktop installation, upgrade, or rollback qualification. No user application was replaced, no commit was pushed, and no release was published or modified.
