# AGENTS.md

Guidance for coding agents operating in the AX Coder repository.

## Language

1. Reply to the user in Traditional Chinese.
2. Write all repository files, source, documentation, comments, configuration, commit messages, and release text in English.
3. Send network and external-service payloads in English.

## Product

AX Coder is the planned persistent desktop experience for supervising multiple coding projects. It owns the
portfolio UI, human-added project registry, desired-state controls, exception inbox, and project-management
experience. It does not own a second coding runtime.

Canonical boundaries:

- AX Code owns coding tools, repository intelligence, coding UX, goal contracts, verification, worktree
  execution, and the worker-facing runtime contract.
- AX Agent owns domain-neutral durable agent runs, tool lifecycle, workflows, approvals, leases, and recovery
  after those capabilities are ready for consumption.
- AX Trust owns enterprise policy, credentials, approvals, grants, and immutable audit.
- AX Telemetry owns the platform observability product. AX Coder may display bounded local health projections.

## Current phase

Phases 1 and 2 are complete, and Phase 3 external release evidence is in progress. The reviewed Desktop source and
its filtered history live under `desktop/`, and the independent workspace consumes the published JSR SDK with a
frozen lockfile and a pinned signed AX Code runtime. Independent CI, CodeQL, and a manual private-repository shadow
workflow are implemented. The local source-ownership cutover is complete under ADR-008: AX Code removed its Desktop
tree at `6a2e03d90411ddd7141047baa59d4a754f1c4107`, and AX Coder is the sole current GUI source owner.

The repository has an active private remote at `defai-digital/ax-code-desktop`. Independent CI and native smoke
checks have run. Signed cross-platform shadow, upgrade, and rollback evidence remains pending. ADR-009 prepares
the independent release target without enabling publication or changing the active updater. Keep public release
disabled, do not rebrand, and do not restore GUI source to AX Code. Follow the governance order below.

## Environment and commands

- Node.js 24 or newer.
- pnpm 10.33.4 through Corepack. Do not use npm or Yarn for this workspace.
- Install with `pnpm install`; committed CI must use `pnpm install --frozen-lockfile`.

| Task                          | Command                                                            |
| ----------------------------- | ------------------------------------------------------------------ |
| Typecheck                     | `pnpm run typecheck`                                               |
| Lint                          | `pnpm run lint`                                                    |
| Tests                         | `pnpm run test`                                                    |
| Desktop build                 | `pnpm run build`                                                   |
| Contract and ownership checks | `pnpm run check:boundaries`                                        |
| Release identity contract     | `pnpm run check:release-contract`                                  |
| Workflow syntax               | `actionlint .github/workflows/*.yml`                               |
| Development app               | `pnpm run dev`                                                     |
| Release readiness (read-only)  | `pnpm run release:preflight`                                       |
| Local unsigned package        | `pnpm run package:desktop -- <platform flags> --publish=never ...` |

Public release commands remain intentionally unavailable until the Phase 3 shadow-release gates pass.

## Documents and governance

- Product requirements: `.internal/prd/`
- Architecture decisions: `.internal/adr/`
- Locked technical behavior and migration mechanics: `.internal/spec/`
- Public operator and user documentation: `docs/` after a released surface exists

Product-boundary or source-ownership work requires, in order:

1. Accepted PRD.
2. Accepted ADRs in every affected repository.
3. Technical specs for source extraction, contracts, data, release, and rollback.
4. Implementation with recorded cross-repository commit and verification evidence.

## Hard rules

- Never fork or duplicate the AX Code or AX Agent canonical runtime.
- Consume the public AX Code SDK as an exact `@defai-digital/ax-code-sdk` JSR version and the worker as a pinned signed
  runtime artifact. Local workspace links are development-only and must not enter CI or release manifests.
- Keep AX Coder's portfolio desired state separate from AX Code execution state and AX Agent run history.
- Never store raw credentials in project records, prompts, events, logs, metrics, or artifacts.
- Never mutate an accepted PRD, ADR, or technical spec silently. Create a versioned proposal; accepted ADRs are
  superseded, not rewritten as though the prior decision never existed.
- Never auto-merge, auto-release, expand permissions, or raise budgets without an explicit policy and approval.
- Parallel reads are allowed. Parallel writers require isolated Git worktrees or deterministic serialization.
- Preserve user changes in sibling repositories. Never stash, reset, clean, or delete sibling worktrees as part
  of extraction automation.
- Preserve source history, license, notice, provenance, signing, updater, bundle identity, and user-data
  continuity during the Desktop move.
- Do not import ignored build output, dependencies, caches, credentials, or local data from `../ax-code/desktop/`.

## Initial implementation record

The active plan is `.internal/prd/PRD-2026-09-02-ax-coder-product-and-desktop-extraction.md`.

Phase 1 evidence is in `.internal/reports/extraction/`. Phase 2 completion evidence is in
`.internal/reports/PHASE-2-2026-09-02-independent-workspace-candidate.md`. Phase 3 local implementation evidence is
in `.internal/reports/PHASE-3-2026-09-02-shadow-release-implementation.md`. Local source-cutover evidence is in
`.internal/reports/PHASE-4A-2026-09-02-local-source-cutover.md`. The workspace consumes the SDK pin in
`config/ax-code-sdk.json`, the signed runtime pin in `config/ax-code-runtime.json`, and the compatibility identity and
release state in `config/desktop-identity.json` and `config/desktop-release-policy.json`. Public release commands
remain unavailable until signed shadow, update, rollback, and human release-cutover gates pass.
