# Desktop Extraction Baseline

## Scope

This report records the accepted Phase 0 source baseline before any Desktop history is imported into AX Coder.

## Repositories

| Repository | State                                                                                            |
| ---------- | ------------------------------------------------------------------------------------------------ |
| AX Code    | Clean `main` at `1c3eb8cbfa1160c35ec3dbc8d05561b4df248d8c`, three commits ahead of `origin/main` |
| AX Coder   | Local initial repository with governance records; no remote and no production source             |
| AX Agent   | Local uncommitted v0.2 scaffold; no released project-manager contract                            |

## Desktop source manifest

| Measure                          | Value                                                                        |
| -------------------------------- | ---------------------------------------------------------------------------- |
| Tracked files under `desktop/**` | 2,750                                                                        |
| Git tree                         | `efea35037e5c25ada3fdf4b20f479cb6534b68ec`                                   |
| `git ls-tree -r -z` SHA-256      | `a16bbd689f1b688c4a9f1c68e14e73e241cd60bd9a178744a258ec4e91b684b7`           |
| Desktop package version          | `7.10.2`                                                                     |
| JSR SDK candidate                | `@defai-digital/ax-code-sdk@2.2.0`, registry linked, zero published versions |

Ignored dependencies and build output account for most of the live Desktop directory size and are not extraction
inputs. The Git object graph is the only source.

## Producer verification

Passed on the baseline or its immediately preceding JSR commit before baseline capture:

- SDK build and typecheck;
- SDK tests: 23 files, 179 tests;
- core typecheck and 13 focused compatibility tests;
- Desktop lint and typecheck;
- Desktop tests: Electron 385, UI 1,577, web 788 passed with one web test skipped;
- Desktop boundary and repository structure checks;
- complete Desktop build including Electron bundle and native `node-pty` rebuild;
- JSR publish dry-run with no slow-type waiver.

Existing Vite chunk-size and dynamic/static-import warnings remain baseline warnings, not extraction regressions.

## External architecture review

DeepSeek V4 Pro and Qwen 3.8 Max independently reviewed the accepted direction in read-only mode. Both prioritized:

- removing the UI's private `ax-code` workspace dependency before SDK publication;
- locking an exact clean baseline and reproducible NUL-safe manifest algorithm;
- filtering only in a disposable clone and retaining a commit map;
- preserving app identity and keeping source removal last;
- treating AX Agent integration as unavailable until a released contract exists;
- using additive producer contracts before consumer migration.

The baseline implements the first item by making work-mode and provider-connect taxonomy public SDK subpaths and
retaining core compatibility re-exports.

## Remaining Phase 0 constraints

- The three AX Code commits are local and must not be treated as externally durable until pushed.
- SDK `2.2.0` must be published from the reviewed final candidate commit before Phase 2 can resolve it from JSR.
- Packaged-app manual macOS smoke and signed identity/data continuity remain release gates, not local source-import
  gates.
