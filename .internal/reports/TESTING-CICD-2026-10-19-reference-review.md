# AX Code and AX Code Desktop testing and CI/CD review

Date: 2026-10-19. Scope: local implementation and verification in both repositories. No publication, branch-protection change, hosted run or release qualification is implied.

## Reference evidence

Sources were read from the local `.internal/reference` trees shared by both repositories. These are snapshot assessments, not claims about current upstream CI health. No upstream implementation was copied.

| Project | Reference HEAD | Evidence | Practices worth adopting |
| --- | --- | --- | --- |
| Orca | `bd7633f6eb5e468c5220be77909071cddc466af4` | `.github/workflows/pr.yml`, `unit-tests.yml`, `e2e.yml` | Conservative change routing, sharded isolated unit runs, explicit required-result aggregate, production Electron E2E and retained artifacts. Its PR aggregate explicitly leaves the currently failing E2E suite advisory; workflow breadth alone is not evidence of passing tests. |
| OpenCode | `31dc762147190f1803dd52bb0909c5163e6cc467` | `.github/workflows/test.yml`, `packages/app/playwright.config.ts` | Linux/Windows unit and compiled-service checks, production-build browser journeys, component browser tests, service-worker upgrade tests, named aggregate checks, screenshots/traces and bounded concurrency. Browser retries are configured; a green result does not by itself prove a first-attempt pass. |
| Hermes Agent | `f4ac0bea1ea50bba62886fb0b7e308e4edee8fd3` | `.github/workflows/ci.yaml`, `tests.yml`, `tests-os.yml`, `e2e-desktop-core.yml`; `pyproject.toml` | Per-file subprocess isolation, real-process core and platform journeys, locked dependencies, explicit offline/live separation, zero-test safeguards, strict selected-job results and native installer/update coverage. These configurations were inspected, not executed here. |

## AX baseline and gaps

- Runtime baseline: `56d6aa801efd6f01c2c30f7b75b1be15e7fc365f`. Already has eight deterministic shards, a zero-retry runtime-contract lane, Windows recovery, native platform qualification, SDK consumer/drift checks, security scans and real TUI frame gates. The main workflow omitted triggers for tested AX Agent runtime/wiki packages and shared toolchain/patch inputs. Thirty-two E2E files were outside the deterministic and runtime-contract lanes and had no automatic lane. JUnit/log/exit-status evidence existed locally, but uploads selected only XML. Empty groups could return success.
- Desktop baseline: `368dc99bad60e45fd376e8ac30869340498700cd`. Already has unit/component suites, security/ownership contracts, a four-platform native matrix and packaged macOS smoke. Renderer E2E was advisory, checked CSP before later interactions, recorded exceptions without failing on them, and retained artifacts only on failure. It lacked an explicit aggregate result and reload journey.
- Existing Desktop reference-directory changes were present before this task and were preserved.

The distribution review also inspected AX Code's `release.yml` and `sdk-jsr.yml`, and Desktop's `desktop-shadow.yml`. Existing controls include SDK regeneration/consumer/provenance checks, deterministic release validation or exact-SHA successful-shard reuse, signed native builds, installer replacement/rollback tests, Desktop exact-inventory shadow receipts and native installation qualification. This work preserves those controls and publication permissions. The runtime test-runner safeguards also apply when the existing release validation invokes `test:ci`.

## Implemented

### AX Code

- Added an `integration` group containing the 32 offline E2E files not already covered by runtime-contract, with a bounded automatic Ubuntu job and zero runner or Vitest retries. It is advisory until hosted stability is known; existing quarantine policy is preserved.
- A clean verification checkout exposed an additional dependency gap: the developer tree had a built PTY addon, while the clean install did not. The integration job now installs its build tools, builds the PTY addon for the active Node runtime, and verifies real input/output/resize/exit before running tests. This is covered by a workflow regression and a local native probe.
- Added CI inventory validation and regressions requiring every offline file to map to an automated group and each group to have a workflow command. Stale explicit test entries fail validation.
- Empty groups/shards now fail. Missing JUnit, zero-test, skipped-only and failed-assertion reports cannot produce success from a zero child exit. Nonzero process exits with passing assertions remain failures, preserving the existing narrowly recognized Effect interruption handling.
- Included missing package, toolchain, patch, tools and root TypeScript inputs in both push and PR triggers. Scheduled validation has its own concurrency group.
- Retained raw stdout, stderr, selected-file inventory, exit status, duration and JUnit together for deterministic, runtime-contract, integration and quarantine runs. Advisory integration status appears in the job summary.
- Added `AX Code required checks`, with behavioral tests rejecting missing, failed, cancelled or unexpectedly skipped required jobs and invalid native plans.

### AX Code Desktop

- Added `Desktop required checks`, checking the classifier and exact selected-job outcomes. Regressions cover documentation-only, unit-only, renderer and full-change scopes, plus missing, failed, cancelled and incorrectly skipped jobs.
- Added reload and post-interaction exception checks; retained CSP failures outside the document so reload cannot erase them. Observed exceptions in the supervision pop-out during its journey.
- Added per-journey screenshots and duration, retained successful E2E evidence and explicit advisory outcomes, and a real-renderer failure-injection self-test. Kept the accepted two-week hosted qualification requirement before promotion.
- Recorded the versioned harness extension in `SPEC-2026-10-19-desktop-e2e-harness-v2.md` without rewriting accepted v1.

## Validation

Local logs are under `.tmp/testing-improvement/` in Desktop and `.internal/reports/testing/competitive-*` in AX Code. Generated logs/screenshots are not repository source. Validation used Node 26 and pnpm 10.33.4.

| Scope | Result |
| --- | --- |
| Desktop root script suites | 237 passed, 7 skipped |
| Desktop Electron suites | 691 passed, 1 skipped |
| Desktop UI suites | 3,534 passed |
| Desktop Web suites | 1,439 passed, 2 skipped |
| Desktop lint, typecheck, boundaries, source-text ratchet, build | Passed; source-text ratchet remains at 44 existing entries |
| Fresh isolated unsigned macOS arm64 package | Packaged successfully; ASAR, runtime dependencies and fuse checks passed |
| Renderer journeys | All seven checks passed against the freshly built unpackaged app and fresh local package |
| Real-renderer failure-detection self-test | Passed against unpackaged and packaged apps: both injected errors remained failures after reload |
| AX Code isolated root script suites | 462 passed, 96 skipped |
| AX Code isolated full deterministic suite | 1,415 files passed, 9 skipped; 16,408 tests passed, 100 skipped; no runner reruns; existing per-test Vitest retry policy retained |
| AX Code focused runner/group regressions | 36 passed |
| AX Code isolated integration, zero retries | All 32 files passed; 400 tests passed, 2 skipped because the optional Rust native glob binding was not built in this checkout |
| AX Code clean PTY preparation | Rebuilt addon for active Node; actual input/output/resize/exit probe passed |
| AX Code isolated structure and typecheck | Passed |
| Both repositories' workflows | `actionlint .github/workflows/*.yml` passed; formatting and whitespace checks passed |

The optional native glob cases remain a qualification limitation, not a claim of executed coverage. The supported native evidence matrix remains in place.

AX Code's shared checkout received unrelated IDE-removal changes during verification. The partial shared-checkout deterministic run was interrupted and is not counted as a pass. Verification moved to an isolated detached worktree based on `56d6aa801efd6f01c2c30f7b75b1be15e7fc365f`, containing only the eight files owned by this task. The original checkout keeps both this task's edits and the unrelated user work. `scope-manifest.json` records the verification base and file hashes.

Final readback confirmed all eight scoped files match the verified worktree. The complete reproducible patch, scope manifest, raw reports, JUnit, native probe and clean-checkout preparation logs are preserved at `../ax-code/.internal/reports/testing/competitive-cicd-20261019-ehp282vk/`. The isolated worktree remains at `/var/folders/_k/7sc0bwc55zq_t81br51f6xn40000gn/T/ax-code-testing-cicd-ehp282vk/checkout` for review. At the initial validation handoff, these changes had not yet been committed or pushed.

Final Desktop status also showed later unrelated Local Models, Settings and locale changes. Those edits were preserved. Desktop's recorded full suite, build and packaged receipts precede those later edits; they qualify this task's harness/workflow changes against its stated baseline, not the combined checkout containing that later work.

Intermediate failures were retained and resolved: the reload driver needed to restore main-window focus after opening supervision; an old local package lacked the new supervision IPC and was replaced with a freshly built isolated test package; the clean runtime checkout needed a PTY native build. No assertion was weakened to excuse those failures.

## Commit and push follow-up

The user authorized committing and pushing this work on 2026-10-19. AX Code's local `main` and remote `main` had diverged, so the scoped local commit `2bf1c70b161a1c9bd310de42f6638c2033c54190` was cherry-picked onto remote `main` at `17ee160ae1f9d02ebb0f2bfc96bcbfdd1db36d49` in an isolated worktree. Commit `d091ff61da6cb6cffc55ad98eda882908d85989d` was pushed to `ci/testing-hardening-20261019`, and `git ls-remote` confirmed the remote SHA. This publishes only the eight-file change without merging or publishing the unrelated local history.

The published runtime candidate passed frozen offline dependency installation, 88 workflow-policy tests, 36 runner/group tests, core typecheck, actionlint and whitespace checks. The earlier full-suite counts remain tied to the initial verification base; the full suite was not rerun on this different remote base. Desktop's current main also passed the 61 focused workflow/scope tests, 13 harness tests, actionlint and whitespace checks before its scoped commit. Desktop's pre-existing reference-directory changes remain excluded.

## Remaining qualification

The new aggregate check names must be selected in GitHub branch protection before they are required by repository policy. No remote settings were changed. Hosted Linux/Windows/ARM execution, measured flake history, real-provider/session browser journeys, accessibility/visual baselines and exact-candidate signed release qualification remain separate evidence requirements. A pre-existing local packaged app, when used, proves driver behavior against that app; it does not prove a newly signed candidate.
