# Repository layout

AX Code Desktop keeps presentation, local server adapters and the Electron shell in separate packages. The current
`desktop/packages/*` workspace layout is intentional. Moving these packages requires coordinated changes to CI,
packaging and scripts, so directory naming alone is not a reason to move them.

## Directory responsibilities

| Path                          | Responsibility                                                                     |
| ----------------------------- | ---------------------------------------------------------------------------------- |
| `desktop/packages/ui`         | React presentation, hooks, UI stores, sync consumers and typed adapter contracts   |
| `desktop/packages/web`        | Vite entrypoints, loopback Express server and local file/Git/terminal adapters     |
| `desktop/packages/electron`   | Main/preload processes, native integration, packaging and desktop journey tests    |
| `desktop/packages/akitty-web` | In-app terminal library, vendored source provenance and its tests                  |
| `desktop/packages/docs`       | User documentation content and sidebar; no package manifest or local website build |
| `desktop/shared`              | Small cross-package contracts, catalogs and environment-neutral helpers            |
| `script`                      | Repository-wide policy, CI, dependency and release verification                    |
| `desktop/scripts`             | Tools spanning desktop packages, including generators and documentation validation |
| `tools`                       | Standalone integrations, currently WinGet manifest generation                      |
| `config`                      | Runtime, SDK, release policy and product identity pins                             |
| `docs`                        | Contributor documentation index and development workflows                          |
| `desktop/docs`                | Desktop-specific architecture, security and operator references                    |
| `.internal/deploy`            | Tracked distribution tooling used by release operations and tests                  |

Keep build output, caches, local session data and generated wiki output out of source control. Private product
records remain local according to `.gitignore`; they are not a substitute for tracked contributor instructions.

## Where new tooling belongs

1. Put a tool used by one package in that package's `scripts/` directory.
2. Put a tool shared by desktop packages in `desktop/scripts/`.
3. Put repository policy, CI and release verification in root `script/`.
4. Keep small shared runtime contracts in `desktop/shared/`; do not put process management or feature ownership there.

Expose commonly used tools through the root `package.json`. Keep existing command names working when moving tools,
and update imports, test discovery and CI in the same change. See
[Project boundaries](../desktop/docs/PROJECT_BOUNDARIES.md) before introducing cross-package dependencies.

## Test ownership

Run `pnpm run test` from the repository root. It runs these groups in sequence:

| Test group                                   | Runner and discovery                                     |
| -------------------------------------------- | -------------------------------------------------------- |
| Root `script/` and `tools/`                  | `pnpm run test:scripts`, root Vitest config              |
| `desktop/shared/**/*.test.mjs`               | `pnpm run test:shared`, Node's test runner               |
| UI                                           | Package Vitest wrapper, including the jsdom Node options |
| Web                                          | Package Vitest runner, including server tests            |
| Electron and `desktop/scripts/**/*.test.mjs` | Electron Vitest config                                   |
| AkiTTY Web                                   | Package Vitest runner and DOM test setup                 |

Co-locate tests with the module they exercise. Shared Node tests use `.test.mjs`; other package tests follow their
package's configured patterns. Do not add a test directory without connecting it to one of these runners. Run UI tests
through `pnpm --dir desktop/packages/ui run test` so they receive the required Node options.

## Dependency configuration

Shared compiler, lint and test tooling uses `catalog:` references to `pnpm-workspace.yaml`. Update a shared tool in
the catalog and regenerate the lockfile with pnpm. Version differences must have a documented compatibility reason.
The SDK remains exactly pinned and checked against `config/ax-code-sdk.json`. Security overrides remain the patch
ratchet. Never edit `pnpm-lock.yaml` by hand.

## Incremental module organization

Keep tests and small feature-specific helpers close to their consumers. Before extracting from a large module,
identify a cohesive responsibility with a small input/output contract. Preserve public exports, error behavior,
ordering and side effects, then run both focused tests and the full gates.

The Git service's `output-parsers.js` is one such extraction: it handles Git output records without running commands
or accessing repository state. `service.js` retains orchestration and its public API.

Future candidates include chat submission and attachment handling, file-view operations, and Electron window/IPC
setup. Extract them when their behavior can be covered independently. Do not move store or sync modules merely to
reduce folder size: their import ratchets and single-writer rules must continue to apply. Changes to package or
runtime ownership follow the repository's product and architecture review process.
