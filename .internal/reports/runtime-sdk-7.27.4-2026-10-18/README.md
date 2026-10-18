# Runtime 7.27.4 and SDK 2.6.35 adoption

Date: 2026-10-18

AX Code Desktop now consumes the published AX Code runtime 7.27.4 and exact JSR SDK 2.6.35. The Electron, UI, and web manifests, frozen lockfile, runtime artifact inventory, producer commit, and contract tests agree. Desktop's independent app version remains 7.27.1.

## Published inputs

- Release: https://github.com/defai-digital/ax-code/releases/tag/v7.27.4
- Annotated tag resolves to producer commit `94a314552db6b48620c43ad3e489110825a2e07d`.
- SDK metadata: https://npm.jsr.io/@jsr/defai-digital__ax-code-sdk
- All four pinned archives were downloaded. Their sizes and SHA-256 hashes match the public asset inventory; detached minisign signatures pass against the existing repository public key.
- The direct JSR version metadata endpoint returned HTTP 403. The official JSR npm compatibility registry supplied the published metadata and integrity consumed by pnpm.

`public-release.json` records the public inventory. `verification.json` records the artifact checks, SDK metadata, and source boundaries. Downloaded archives remain outside the repository.

## Validation

All final commands exited successfully; captured output is in `validation/` with trailing whitespace normalized.

| Check | Result |
| --- | --- |
| `pnpm install` and `pnpm install --frozen-lockfile` | Passed |
| `pnpm run test` | 5,544 passed, 10 skipped |
| `pnpm run typecheck` | Passed |
| `pnpm run lint` | Passed |
| `pnpm run check:boundaries` | Passed, including runtime and release contracts |
| `pnpm run build` | Passed; Turbo reused two unchanged build tasks |
| Downloaded Darwin ARM64 runtime `--version` | 7.27.4 |
| Actual SDK 2.6.35 with signed native runtime 7.27.4 | Health, capabilities, and command catalog passed |

`verify-sdk-runtime.mjs` uses an isolated temporary configuration and loopback server with the downloaded runtime on PATH. It makes no model request and closes the server after checking. `native-sdk-smoke.json` records the successful result. Rerunning requires dependencies and the downloaded archive extraction at the recorded temporary path.

Initial validation caught an Electron manifest still using the previous SDK and contract expectations still using the previous producer SHA; both were corrected before the final suite. The initial native smoke asserted an exact health response shape and rejected valid additional startup metadata. It now checks the required healthy/version fields. Existing Vitest mock-hoisting warnings remain visible in the test output.

## Analysis feature and distribution boundary

Desktop analysis-app handoff is implemented in local commit `33abaf42`; the canonical runtime analysis skill and Craft guidance are implemented in local commit `ff84ba9f1`. See [the feature report](../analysis-app-handoff-2026-10-18/README.md).

The published v7.27.4 producer commit precedes `ff84ba9f1`. Both its source tree and the live command-catalog smoke confirm that it does not contain the new `analysis-output` builtin. This dependency update therefore does not deliver that builtin to installed users. A later qualified runtime release containing the feature is still required.

Linux and Windows signatures were verified, but their binaries were not executed on this Mac. This report is not signed Desktop installation, upgrade, or rollback qualification. No user application was replaced, no commit was pushed, and no release was published or modified. The pre-existing `.internal/reference/README.md` change was preserved.
