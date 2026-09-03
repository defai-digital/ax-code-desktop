# Phase 4A Local Desktop Source Cutover Evidence

## Outcome

The local source-ownership cutover is complete. AX Coder is the sole current Desktop GUI source owner, while AX Code
retains the coding runtime, CLI, TUI, headless server, generated SDK, native modules, integrations, and external
application-host contracts.

This is not a public release cutover. AX Coder remains `shadow-only`, AX Code no longer contains a Desktop publisher,
and no tag, push, GitHub Release, updater metadata mutation, package publication, rebrand, signing change, installed
application change, or user-data migration occurred.

## Paired commit ledger

| Repository | Commit                                     | Purpose                                                              |
| ---------- | ------------------------------------------ | -------------------------------------------------------------------- |
| AX Coder   | `daed764`                                  | Authorize the separately gated local source cutover                  |
| AX Coder   | `0a354744ca81f1ac90a1a4f8f11b8697d2e30268` | Enforce sole Desktop source ownership and fail-closed release policy |
| AX Coder   | `7e92a80736d3e36534df9109dc04d742098d1c1f` | Receive the Desktop Winget manifest generator                        |
| AX Code    | `6a2e03d90411ddd7141047baa59d4a754f1c4107` | Remove the Desktop source, workspace, CI, and publisher              |

The AX Code removal commit records `7e92a80736d3e36534df9109dc04d742098d1c1f` in its commit message as the
receiving commit.

## Ownership invariant

| Check                                        | Result                              |
| -------------------------------------------- | ----------------------------------- |
| AX Coder tracked `desktop/**` files          | 2,751                               |
| AX Code tracked `desktop/**` files           | 0                                   |
| AX Code physical `desktop/` directory        | Absent                              |
| AX Code Desktop workspace and Turbo tasks    | Absent                              |
| AX Code Desktop CI and release workflows     | Absent                              |
| AX Code in-checkout Desktop runtime fallback | Removed and regression-tested       |
| AX Coder public release state                | `shadow-only`; publication disabled |

The AX Code historical changelog moved to `CHANGELOG.md`. The node-pty executable-bit repair still needed by the TUI
terminal moved to `script/fix-node-pty-permissions.mjs`. Desktop Winget generation moved to AX Coder; AX Code's
generator now produces only the CLI package.

Ignored dependencies, build output, and caches from the removed AX Code Desktop directory were not imported into AX
Coder. They were moved to `~/.Trash/ax-code-desktop-generated-cutover-20260902` and remain locally recoverable until
the Trash is emptied. All tracked source remains recoverable from Git.

## AX Coder verification

| Gate                     | Result                                                                                                                              |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Frozen install           | Passed for all 4 workspace projects                                                                                                 |
| Workflow syntax          | `actionlint` passed                                                                                                                 |
| Source ownership         | Passed with 2,751 tracked Desktop files                                                                                             |
| Boundaries and contracts | All Desktop, store, Electron, endpoint, IPC, package-test, sibling, runtime-pin, release-policy, and release-contract checks passed |
| Root script tests        | 13 files; 61 tests passed                                                                                                           |
| Electron tests           | 52 files; 383 tests passed                                                                                                          |
| UI tests                 | 248 files; 1,577 tests passed                                                                                                       |
| Web tests                | 99 files; 788 passed and 1 skipped                                                                                                  |
| Typecheck                | Electron, UI, and web passed                                                                                                        |
| Lint                     | Electron, UI, and web passed                                                                                                        |
| Build                    | 3 Turbo tasks passed                                                                                                                |
| Release contract         | App 7.10.2, SDK 2.2.0, runtime 7.10.2, `shadow-only`                                                                                |

Existing Vite dynamic/static import and large-chunk warnings match the prior Phase 2 and Phase 3 baseline.

## AX Code verification

| Gate                              | Result                                                                                                                     |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Frozen install                    | Passed for all 19 workspace projects                                                                                       |
| Source ownership regression       | Passed; no tracked or physical root Desktop tree                                                                           |
| Repository structure              | Passed                                                                                                                     |
| Root script tests                 | 24 files; 130 tests passed                                                                                                 |
| SDK generation                    | Passed with no generated artifact drift                                                                                    |
| SDK tests                         | 23 files; 179 tests passed                                                                                                 |
| Direct cutover tests              | 3 files; 14 tests passed                                                                                                   |
| Full workspace typecheck          | Passed for 18 runnable workspace projects                                                                                  |
| TUI checks                        | Vendor, patches, spinner dist, layering, snapshot, and 164 renderer tests passed                                           |
| Workflow syntax                   | `actionlint` passed                                                                                                        |
| Bare JSON and no-cost checks      | Passed                                                                                                                     |
| Self-scan                         | Passed after removing two obsolete checkout-path findings and refreshing relocated fixed-path fingerprints; 0 new findings |
| Deterministic core suite          | 8,401 tests; 0 failures; 2 skipped; 621.71 seconds                                                                         |
| Post-commit model snapshot checks | 5 files; 230 tests passed, and core typecheck passed                                                                       |

The first deterministic run exposed an obsolete test that still expected the removed SDK npm publisher. The test was
corrected to cover only the remaining plugin npm flow; the SDK's JSR publication contract remains covered by its SDK
tests. The complete deterministic suite then passed.

The AX Code pre-commit hook refreshed `models-snapshot.json` from the configured generator. Provider and snapshot
tests were therefore rerun after the commit and passed.

## Release freeze and remaining work

The following evidence is still required before public Desktop release ownership can move:

1. An authorized private AX Coder remote and CI environment.
2. Cross-platform unsigned and required-signing shadow runs.
3. Apple, Windows, and Minisign identity verification without copying raw credentials.
4. Clean install, upgrade, data and credential continuity, sleep/resume, restart, and rollback evidence.
5. Explicit human approval to enable a public publisher and updater cutover.

Until those gates pass, Desktop source fixes land only in AX Coder, but no new public Desktop release can be produced
from either repository.

## Rollback

Revert AX Code commit `6a2e03d90411ddd7141047baa59d4a754f1c4107` to restore the prior tracked source and local
publisher mechanics, then revert the AX Coder ownership commits only if duplicate source ownership is intentionally
being restored. Do not rewrite either repository's history, delete AX Coder, copy dependencies or build output across
the boundary, or mutate installed user data during rollback.
