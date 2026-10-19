# Local model settings capability gating

## Accepted implementation plan

The user approved planning, implementation, tests, and a local commit on 2026-10-19. Scope is the existing Desktop Settings > Models surface. Runtime execution policy, remote attachment policy, release versions, and provider configuration ownership are unchanged.

1. Rename Models to Local Models so it does not imply all providers are platform-specific.
2. Share one live runtime catalog/connection snapshot between Settings navigation and the page. Use runtime eligibility rather than the renderer OS, package target, or a duplicate hardware rule.
3. Hide the ordinary navigation entry only after the runtime confirms local execution is unsupported and there is no attached connection or existing local resource to manage.
4. Preserve direct links and search discovery with an explanatory page and Open Providers action. Preserve configured attach connections, existing files, active downloads, and running servers.
5. Keep unknown/loading and failed requests distinct from unsupported hosts; offer retry. Reject stale responses across project changes and settings closure.
6. Put connection configuration behind Advanced connection, expand existing attach connections, and explain that existing-server URLs must target localhost on the runtime host.
7. Add behavioral regressions, verify the UI and locale contracts, and commit only this change.

## Implementation

`LocalModelsProvider` owns the shared, non-persisted snapshot while Settings is open. Concurrent refreshes share an in-flight request. Directory/scope changes mask the previous snapshot immediately, abort cancellable requests, and reject late results, including a return to a previously visited directory. Catalog and connection requests settle independently so a catalog failure does not remove an existing attach connection. No request starts an engine or changes configuration.

The normal sidebar omits Local Models only for a confirmed unsupported runtime without existing connections/resources. Search deliberately retains the destination so an explicit search or saved link can explain the limitation. Providers remains available. The page removes setup/download/start controls on unsupported hosts; existing resources retain cleanup/Stop controls. Host blockers come from the runtime with internal error-code prefixes removed. There is no duplicated macOS/chip/version allowlist in Desktop.

The supported page retains install/update and model management. Advanced connection is collapsed for managed mode and expanded for configured attach mode. The page no longer displays source-tree paths in its introductory product copy. New text and the Local Models label cover all 14 locales.

## Validation

All final checks passed. Receipts are in [local-models-2026-10-19](local-models-2026-10-19/validation.json).

- Focused rendered page/navigation and metadata regressions: **34 passed** across three files.
- Full UI suite: **3,552 passed** across 546 files. A subsequent closed-dialog regression was added and passed in the final focused run; the full suite was not repeated after that test-only addition.
- UI typecheck and lint: passed.
- Locale contract: all 14 locales passed (4,912 keys and 63,856 translated entries).
- Boundary and release-contract checks: passed.
- Desktop production build: passed, all three tasks rebuilt.

The test scope includes unsupported Windows/Linux/Intel/M1/older-macOS responses, unknown/loading state, retry, existing attach recovery, retained Stop, sidebar visibility, search/direct links, shared request reuse, and project-switch races. These are simulated runtime responses and rendered component tests, not native Windows/Linux qualification.

No release, installation, or push is part of this task. Existing unrelated work in this checkout is excluded from the commit.
