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

Phase 1 history extraction is complete, and Phase 2 independent-workspace implementation is in progress. The
reviewed Desktop source and its filtered history now live under `desktop/`. The original source remains under
`../ax-code/desktop/` until the independent build, package, smoke, release, update, rollback, and paired-cutover
gates pass.

Do not delete source from AX Code, publish, rebrand, or release Desktop production artifacts merely because the
history import is complete. Follow the governance order below.

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

Phase 1 evidence is in `.internal/reports/extraction/`. Use the workspace commands defined by Phase 2 after its
root configuration lands; release commands remain unavailable until the shadow-release specification is implemented.
