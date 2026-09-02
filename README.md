# AX Coder

AX Coder is a persistent desktop application in development for exception-driven supervision of multiple coding
projects. A human adds projects, approves product and architecture contracts, sets priorities and budgets, and
reviews exceptions. AX Coder observes durable project state, proposes the next work, and dispatches bounded
coding tasks to AX Code workers.

## Status

Phase 1 is complete: the reviewed AX Code Desktop history is present under `desktop/`, with exact provenance and
reproducibility evidence in `.internal/reports/extraction/`. Phase 2 is creating an independent workspace and
published-contract dependency boundary.

The existing AX Code Desktop implementation remains in `../ax-code/desktop/` during the safety window. It will be
removed there only after the independent contract, CI, packaging, updater, data-continuity, release, and rollback
gates pass. The migration must not fork AX Code runtime behavior or discard uncommitted user work.

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
`@defai-digital/ax-code-sdk` version from JSR plus a separately pinned signed AX Code runtime. The first SDK
publication is still pending; the JSR scope, package, and OIDC repository link are ready.
