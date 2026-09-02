# SPEC: Independent Desktop Workspace

| Field   | Value                                      |
| ------- | ------------------------------------------ |
| Status  | Local candidate complete; JSR lock pending |
| Related | Active PRD; ADR-001; ADR-003; ADR-004      |

## 1. Root workspace

AX Coder uses Node.js 24 or newer, pnpm `10.33.4`, strict ESM TypeScript, Turbo, Prettier with `semi: false` and
`printWidth: 120`, ESLint for Desktop packages, and Vitest. The root is private and initially keeps `desktop/packages/*`
as workspace paths to minimize extraction churn.

The root commands are:

```text
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm run lint
pnpm run test
pnpm run build
pnpm run check:boundaries
pnpm run check:no-sibling-dependencies
```

Root package, catalog, Turbo, security overrides, and lockfile are generated from the reviewed Desktop dependency
closure. They are not copied wholesale from AX Code.

## 2. Package identities

The extraction release preserves:

- `@openchamber/ui`;
- `ax-code-desktop` and its `ax-code-desktop`/`openchamber` command aliases;
- `@ax-code/electron`;
- package version `7.10.2` until an explicit candidate-version decision.

These compatibility identities are not public ownership claims and may be reconsidered only after cutover.

## 3. AX Code dependencies

Both UI and web packages use exactly:

```json
{
  "@defai-digital/ax-code-sdk": "jsr:@defai-digital/ax-code-sdk@2.2.0"
}
```

Source imports replace `@ax-code/sdk` with `@defai-digital/ax-code-sdk`. The UI's former direct `ax-code` dependency
has already been eliminated at the producer baseline: work-mode and provider-connect helpers are public SDK subpaths.

Production manifests, lockfiles, source, tests, generated files, and CI must not contain:

- `workspace:` for AX Code dependencies;
- `link:`, `file:`, or `../ax-code`;
- imports from `ax-code/*`, SDK `src/`, or SDK `dist/`;
- the in-process `createAgent()` adapter.

## 4. Runtime sidecar

Packaging stages a signed AX Code release artifact into an ignored generated resource directory. A checked-in manifest
pins release version, platform, filename, size, SHA-256 digest, and Minisign public-key identity. The staging command
verifies every field before extraction or execution. PATH and local source builds are explicit developer overrides and
are rejected in package/release mode.

## 5. Ported checks

Port and adapt Desktop boundary, store-boundary, endpoint, IPC, package-test, Electron-runtime, and version compatibility
checks. The new version check compares Desktop packages to the pinned runtime manifest rather than an in-workspace AX
Code package manifest.

## 6. Exit criteria

A fresh clone with no AX Code sibling checkout installs with a frozen lockfile and passes every root command. The
unsigned Electron build must identify its exact SDK and runtime pair and keep the updater disabled outside a signed
candidate channel.

## 7. Implementation progress

The local candidate landed at `b3c24fd3cc8ece6a56b7720efcd36285d278a00e`. Boundaries, typecheck, lint, complete
tests, build, signed-runtime staging, unsigned packaging, ASAR audit, and packaged-app smoke pass. Detailed evidence is
in `.internal/reports/PHASE-2-2026-09-02-independent-workspace-candidate.md`.

This specification remains open until SDK `2.2.0` is available from JSR, the production lockfile is committed, and a
fresh clone with no AX Code sibling passes the complete frozen-install gate.
