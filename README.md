# AX Coder

AX Coder is a persistent desktop application in development for exception-driven supervision of multiple coding
projects. A human adds projects, approves product and architecture contracts, sets priorities and budgets, and
reviews exceptions. AX Coder observes durable project state, proposes the next work, and dispatches bounded
coding tasks to AX Code workers.

## Status

Phases 1 and 2 are complete. The reviewed Desktop history and provenance live under `desktop/` and
`.internal/reports/extraction/`. AX Coder is the sole current GUI source owner under
[ADR-008](.internal/adr/ADR-008-source-cutover-with-release-freeze.md).

Phase 3 signed shadow-release, cross-platform, upgrade, and rollback evidence remains pending. Public release
is disabled. The source cutover does not qualify a public release or change the compatibility identity.

## Product boundary

- AX Coder: portfolio experience, project registry, desired state, exception inbox, and manager UX.
- AX Agent: durable project-manager execution, workflows, leases, approvals, and recovery when contract-ready.
- AX Code: coding worker, repository tools, goal contracts, verification, sessions, and worktrees.
- Human: product scope, accepted architecture, permission and budget expansion, merge, release, and go/no-go.

See [the active PRD](.internal/prd/PRD-2026-09-02-ax-coder-product-and-desktop-extraction.md).

## Repository state

No remote, release channel, package namespace, bundle identity change, or license transition is implied by the
local repository initialization. Those decisions require the ADR and specification sequence described in
`AGENTS.md`.

The AX Code SDK dependency decision is accepted: production will use an exact
`@defai-digital/ax-code-sdk` version from JSR plus a separately pinned signed AX Code runtime. Current pins are
recorded in `config/ax-code-sdk.json` and `config/ax-code-runtime.json` and checked independently of release approval.

## Development

Requirements are Node.js 24 or newer and pnpm 10.33.4 through Corepack.

```bash
corepack enable
pnpm install
pnpm run check:locales
pnpm run check:boundaries
pnpm run typecheck
pnpm run lint
pnpm run test
pnpm run build
```

The workspace never resolves AX Code from sibling source. Development uses an explicit `AX_CODE_BINARY` or an
installed `ax-code` on PATH; packaged candidates use the signed artifact pinned in
`config/ax-code-runtime.json`.

## Desktop languages

Settings → Appearance → Language controls the interface and future conversation requests independently.
The interface supports English, Traditional Chinese, Simplified Chinese, Japanese, Korean, French, German,
Indonesian, Italian, Brazilian Portuguese, Russian, Spanish, Turkish, and Vietnamese. Follow system language
resolves the OS preference list and retains its region for number and date formatting. Conversation Auto adds
no language instruction; an explicit preference defers to user requests and project instructions.

Preferences are saved separately in the Electron user-data directory and synchronized across desktop windows.
Catalogs are packaged for offline use, loaded lazily in the renderer, and available immediately to native menus
and recovery dialogs. Add English keys first, translate every catalog, preserve named placeholders, review any
identical wording in `desktop/shared/shared-spelling.json`, then run `pnpm check:locales --write-native`.
CI checks completeness and generated native catalogs. Structural checks do not constitute native-speaker review
or signed cross-platform release qualification; public release remains disabled.
