# AGENTS.md

Guidance for coding agents operating in the AX Code Desktop repository.

## Language

1. Reply to the user in Traditional Chinese.
2. Write all repository files, source, documentation, comments, configuration, commit messages, and release text in English.
3. Send network and external-service payloads in English.

## Product

The product is AX Code and this desktop app is AX Code Desktop (ADR-015). Do not write "AX Coder" in new text;
older records use that name for this repository.

AX Code Desktop is the persistent desktop experience for supervising multiple coding projects. It owns the
portfolio UI, human-added project registry, desired-state controls, exception inbox, and project-management
experience. It does not own a second coding runtime.

Canonical boundaries:

- The AX Code runtime owns coding tools, repository intelligence, coding UX, goal contracts, verification, worktree
  execution, and the worker-facing runtime contract.
- AX Agent owns domain-neutral durable agent runs, tool lifecycle, workflows, approvals, leases, and recovery
  after those capabilities are ready for consumption.
- AX Trust owns enterprise policy, credentials, approvals, grants, and immutable audit.
- AX Telemetry owns the platform observability product. AX Code Desktop may display bounded local health projections.

## Current phase

Extraction phases 1 to 3 are complete. The reviewed Desktop source and its filtered history live under `desktop/`, and
the independent workspace consumes the published JSR SDK with a frozen lockfile and a pinned signed AX Code runtime.
Independent CI, CodeQL and the signed shadow workflow are implemented. The local source-ownership cutover is complete under ADR-008: AX Code removed its Desktop
tree at `6a2e03d90411ddd7141047baa59d4a754f1c4107`, and AX Code Desktop is the sole current GUI source owner.

The repository has an active public remote at `defai-digital/ax-code-desktop`, and public releases ship from it under
ADR-012. 7.27.3 was published on 2026-10-19 after signed shadow qualification and native install, upgrade, rollback and
profile/configuration continuity receipts (`.internal/reports/RELEASE-2026-10-19-v7.27.3-publication.md`). ADR-012
does not pre-qualify later versions: every release needs its own exact-inventory signed qualification and explicit
publication approval. Do not change the compatibility identity or move GUI source back into the AX Code runtime
repository.

The active improvement plan is `.internal/prd/PRD-2026-10-19-competitive-quality-v1.md` (renderer security baseline,
end-to-end harness, structure and supervision work). Settled decisions and their records are indexed in
`.internal/prd/README.md`, `.internal/adr/README.md` and `.internal/spec/README.md`.

## Environment and commands

- Node.js 26 or newer.
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
| End-to-end journeys (after build) | `pnpm run e2e:desktop` (`-- --app <path>.app` for packaged)     |
| Harness failure-detection self-test (after build) | `pnpm run e2e:desktop:self-test` (also accepts `-- --app <path>.app`) |
| Source-text test ratchet       | `pnpm run check:source-text-tests` (part of `check:boundaries`)    |
| Local unsigned package        | `pnpm run package:desktop -- <platform flags> --publish=never ...` |

Public distribution commands require signed exact-inventory qualification; user publication approval is recorded under ADR-012.

## Analysis outputs and diagrams

- The AX Code runtime owns the canonical `analysis-output` skill and routing between static artifacts,
  governed analytics through AX BI MCP, and ordinary project development. Do not copy that skill into Desktop.
- AX BI owns datasets, SQL, charts, dashboards and its existing authorization model. A BI connection is optional;
  one-off findings, Mermaid and static exports must not require a BI service, credentials or Docker.
- Historical `ax-code-app` fences render as ordinary inert code. Desktop has no dedicated Streamlit Run/Prepare
  control, Python installer, framework discovery or progress protocol. Legacy saved recipes migrate to ordinary
  project actions without executing, installing, deleting user files or stopping existing servers.
- The general project runner owns the terminal, preview and explicit Stop. Closing a preview leaves its server
  running. Explicit framework development uses these ordinary project tools.
- Mermaid's machine-readable capability contract is
  `desktop/packages/ui/src/components/chat/mermaidCapabilities.json`. It distinguishes the pinned worker renderer's
  SVG/ASCII types from the lazily loaded official renderer's SVG-only types. Consult it and the global
  `desktop-mermaid-capability` skill before claiming a diagram type. Changes require matching fixtures, rendered
  verification, and a versioned capability-contract record; do not duplicate the list here or in a project skill.
- Static analysis results belong in the conversation or actual artifacts. Return AX BI result links through the
  existing browser flow; do not recreate analytics runtime ownership inside Desktop.
- Verify UI-only changes with `pnpm --dir desktop/packages/ui run type-check` and the focused Vitest files. Changes
  that touch analysis-app rendering or project actions must also pass the full UI test suite.

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
- Keep AX Code Desktop's portfolio desired state separate from AX Code execution state and AX Agent run history.
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

The extraction umbrella plan is `.internal/prd/PRD-2026-09-02-ax-coder-product-and-desktop-extraction.md`.

Phase 1 evidence is in `.internal/reports/extraction/`. Phase 2 completion evidence is in
`.internal/reports/PHASE-2-2026-09-02-independent-workspace-candidate.md`. Phase 3 local implementation evidence is
in `.internal/reports/PHASE-3-2026-09-02-shadow-release-implementation.md`. Local source-cutover evidence is in
`.internal/reports/PHASE-4A-2026-09-02-local-source-cutover.md`. The workspace consumes the SDK pin in
`config/ax-code-sdk.json`, the signed runtime pin in `config/ax-code-runtime.json`, and the compatibility identity and
release state in `config/desktop-identity.json` and `config/desktop-release-policy.json`. Public release commands
publish only an exact candidate that passed signed shadow, update, rollback and continuity qualification, with explicit
user approval for that version.
