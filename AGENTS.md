# AGENTS.md

Guidance for coding agents operating in the AX Code Desktop repository.

## Language

1. Reply to the user in Traditional Chinese.
2. Write all repository files, source, documentation, comments, configuration, commit messages, and release text in English.
3. Send network and external-service payloads in English.

There is no `.cursor/`, `.cursorrules`, or `.github/copilot-instructions.md` in this repository, so this file plus
`desktop/CONTRIBUTING.md` are the complete agent rule set.

## Product and boundaries

The product is AX Code and this desktop app is AX Code Desktop (ADR-015). Do not write "AX Coder" in new text; older
records use that name for this repository. AX Code Desktop owns the portfolio UI, human-added project registry,
desired-state controls, exception inbox, and project-management experience. It does not own a second coding runtime.

- The AX Code runtime owns coding tools, repository intelligence, goal contracts, verification, and worktree execution.
- AX Agent owns durable agent runs, workflows, approvals, leases, and recovery once those are released for consumption.
- AX Trust owns enterprise policy, credentials, grants, and immutable audit.
- AX Telemetry owns platform observability; Desktop may display bounded local health projections.

Layout: `desktop/packages/ui` (shared React library `@openchamber/ui`), `desktop/packages/web` (`ax-code-desktop`,
Express server + Vite renderer), `desktop/packages/electron` (`@ax-code/electron`, main/preload/packaging),
`script/` (root checks), `config/` (runtime, SDK, identity, release-policy pins), `.internal/` (governance records).

## Toolchain

- Node.js >= 26. pnpm 10.33.4 through Corepack. Never npm or Yarn; `preinstall` enforces pnpm.
- `pnpm install` locally; CI must use `pnpm install --frozen-lockfile`.
- The SDK comes from GitHub Packages (`.npmrc` sets `@defai-digital:registry`). Installing needs a user-level
  `//npm.pkg.github.com/:_authToken=...` line. Never commit a token (ADR-022).

## Commands

Run every gate from the repository root. `pnpm run typecheck`, `pnpm run lint`, `pnpm run test`, and
`pnpm run check:boundaries` must pass before you report work as done; add `pnpm run build` when you touched bundling,
packaging, Vite config, or the electron main process.

| Task | Command |
| --- | --- |
| Typecheck | `pnpm run typecheck` |
| Lint | `pnpm run lint` |
| Tests (all) | `pnpm run test` |
| Root script/tool tests | `pnpm run test:scripts` |
| Build shell | `pnpm run build` |
| Boundaries and contracts | `pnpm run check:boundaries` |
| Locale catalogs | `pnpm run check:locales` |
| Release identity contract | `pnpm run check:release-contract` |
| Workflow syntax | `actionlint .github/workflows/*.yml` |
| Development app | `pnpm run dev` |
| Release readiness (read-only) | `pnpm run release:preflight` |
| End-to-end journeys (after build) | `pnpm run e2e:desktop` (`-- --app <path>.app` for packaged) |
| Harness self-test | `pnpm run e2e:desktop:self-test` |
| Interactive UI WebMCP lab | `pnpm run dev:webmcp` |

`pnpm run test` runs `test:scripts` first, then each package serially (`--workspace-concurrency=1`). `pnpm run build`
is `turbo run build:shell --filter=@ax-code/electron`, not the dev app.

### Running a single test

```bash
# Root script/ and tools/ tests (Vitest 4, node env)
pnpm exec vitest run --config vitest.config.ts script/check-desktop-boundaries.test.ts

# UI package: one file. Pass vitest args directly; a bare `--` makes it run the whole suite.
pnpm --dir desktop/packages/ui run test src/stores/useProjectsStore.test.ts

# UI package: one test by name
pnpm --dir desktop/packages/ui run test src/stores/useProjectsStore.test.ts -t "pins a project"

# Web package (vitest run, no config flag needed)
pnpm --dir desktop/packages/web run test vite-api-ws-proxy.test.ts

# Electron package
pnpm --dir desktop/packages/electron run test src/api-prefix-router.test.mjs

# Optional unified runner: all three projects from one config
pnpm exec vitest run --config desktop/vitest.config.ts --project ui desktop/packages/ui/src/stores/useProjectsStore.test.ts
```

UI tests need the `--no-experimental-webstorage` NODE_OPTIONS that `desktop/packages/ui/scripts/run-tests.mjs`
injects; always go through `pnpm --dir desktop/packages/ui run test` rather than calling `vitest` there directly.

## Code style

Formatting (root `package.json` prettier block, `.editorconfig`): 2-space indent, LF, final newline, no semicolons,
print width 120, single quotes are not enforced — match the file. No format script and no CI format gate exist, so do
not reformat untouched lines; CI runs typecheck, lint, tests, and the contract checks only. File naming: components
`PascalCase.tsx`, stores `useXStore.ts`, library modules `camelCase.ts`, electron `kebab-case.js`/`.mjs`, web server
modules `kebab-case.js` with a sibling `.test.js`.

TypeScript: `strict: true` with `verbatimModuleSyntax`, `noEmit`, `moduleResolution: bundler`, target ES2022. Use
`import type` for type-only imports. Path aliases are per package: `@/*` inside UI, `@web/*` and `@openchamber/ui*`
in web. No `any` without a written justification; prefer `unknown` plus narrowing, or a named type alias. Express
handlers in `web/server` are plain JS and are not type-checked, but they must stay lint-clean (`no-undef`).

Imports: external packages first, then `@/`-aliased internal modules, then relative paths, then side-effect imports.
Use `import x from "node:path"` for Node builtins in `script/`, `desktop/scripts/`, and electron `.mjs` tooling;
`web/server` files use bare `"fs"`/`"path"` to match their neighbours.

Naming: hooks are `useX`, stores export `useXStore`; constants are `SCREAMING_SNAKE_CASE`. Two modules under
`src/stores/` or `src/sync/` may not export the same `useX` name (rule R4).

Types and data: declare an `interface` or `type` for store shapes and API payloads instead of inline object literals;
export shared payload types from one module. Prefer early returns and `if`/`switch` over nested ternaries. Functional
React components only, hooks called unconditionally at the top level, `react-refresh` compatible exports.

UI and localization: use existing theme tokens from `desktop/packages/ui/src/lib/theme/` and typography from
`src/lib/typography.ts`; do not add new color or typography primitives. Every component must render correctly in both
light and dark themes. User-facing strings go through `t("settings.…")` from `src/lib/i18n`; English lives in
`src/lib/i18n/messages/en.ts` and `en.settings.ts`, other locales in `messages/<locale>.json`. Run
`pnpm run check:locales` after touching catalogs.

Error handling: handle errors at boundaries (user input, filesystem, network, IPC, child processes). Validate and
reject path-like input before filesystem work — see `assertSafeResourceName` in `web/server/lib/ax-code/shared.js`.
In Express routes always `return res.status(4xx|5xx).json({ error })`; do not swallow errors silently, and never log
credentials or raw tokens.

Comments: explain non-obvious rationale, invariants, and spec references (for example `SPEC-2026-08-29 … S2.4`). Match
the surrounding comment density; do not narrate obvious code. Tests describe behavior, not implementation.

## Architecture rules enforced by checks

`pnpm run check:boundaries` runs twelve checks; treat them as build failures and fix the cause, not the baseline.

- No Desktop package may import a sibling package's source tree. Cross-package access goes through documented
  `@openchamber/ui/*` entrypoints or the `@defai-digital/ax-code-sdk` public exports. Dev-only exceptions are
  individually reviewed in `script/check-desktop-boundaries.ts`.
- The UI package must not depend on `electron`, `express`, `node-pty`, `simple-git`, or other server/shell packages.
- The web package must not use the `@/` alias, which resolves directly into UI source.
- Store boundary rules: `src/stores/` top-level modules may not import each other except through a frozen allowlist
  that may only shrink; files outside `src/sync/` must not import sync internals; the unified transport client and the
  connection-state writers have registered consumers only.
- IPC: every `desktop_*` command must be declared in `desktop/packages/electron/src/desktop-ipc-contract.json`, have a
  main-process handler, and declare `none` or `object` params. `src/lib/desktopIpcContract.gen.ts` is generated; never
  edit it by hand.
- Renderer security baseline (ADR-018): sandboxed, context-isolated renderer, hashed inline scripts, no `unsafe-eval`
  for app documents, and external navigation served with a restrictive CSP.
- Tests must assert behavior, not source text. `pnpm run check:source-text-tests` fails any new test that reads a sibling
  source file with `readFile`.
- No sibling-repository dependency on `../ax-code`, and never import ignored build output, caches, or credentials from it.

## Testing expectations

- Put a test next to the code as `<module>.test.ts|.tsx|.js|.mjs`; UI tests live under `desktop/packages/ui/src/**` and
  use the jsdom setup in `src/test/setup.ts`.
- Cover the changed behavior plus the failure path. Add a test that fails before a fix and passes after.
- Renderer changes: run the focused Vitest files and `pnpm --dir desktop/packages/ui run type-check`; changes touching
  analysis-app rendering or project actions must also pass the full UI suite.
- Verify asynchronous UI changes with fresh state reads and DOM/screenshot evidence through
  `docs/development-webmcp.md`, not action acknowledgements. Packaged builds disable that surface.

## Governance

Product requirements live in `.internal/prd/`, architecture decisions in `.internal/adr/`, locked technical behavior in
`.internal/spec/`, and evidence in `.internal/reports/`; each directory has a `README.md` index. Boundary or
source-ownership work requires, in order: accepted PRD, accepted ADRs, technical specs, then implementation with recorded
commit and verification evidence. Never mutate an accepted PRD, ADR, or spec silently — add a versioned proposal;
accepted ADRs are superseded, not rewritten.

Hard rules: never fork or duplicate the AX Code or AX Agent canonical runtime; keep Desktop portfolio desired state
separate from AX Code execution state; never store raw credentials in records, prompts, events, logs, metrics, or
artifacts; never auto-merge, auto-release, expand permissions, or raise budgets without explicit policy and approval;
parallel readers are fine but parallel writers need isolated Git worktrees; preserve user changes in sibling
repositories and never stash, reset, or clean them. Keep upstream OpenChamber attribution in `NOTICE` and update it in
the same change when importing third-party code.