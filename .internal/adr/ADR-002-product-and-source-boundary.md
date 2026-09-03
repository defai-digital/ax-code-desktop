# ADR-002: Establish the AX Coder Product and Source Boundary

| Field          | Value                                             |
| -------------- | ------------------------------------------------- |
| Status         | Accepted                                          |
| Implementation | Phases 1 and 2 complete; Phase 3 in progress      |
| Date           | 2026-09-02                                        |
| Deciders       | User; AX Coder and AX Code maintainers            |
| Related        | Active PRD; AX Code ADR-055, ADR-063, and ADR-067 |

## Context

AX Code is a coding runtime with CLI, TUI, headless, server, SDK, and integration surfaces. The existing Desktop
application lives in the AX Code repository, while the requested AX Coder product is a persistent multi-project
supervision experience with an independent lifecycle. Leaving the new product in AX Code would expand the coding
runtime into a general control plane. Copying the Desktop indefinitely would create two production owners.

## Decision

AX Coder owns the Desktop experience, human-added project registry, portfolio desired state, exception inbox, and
project-management UX. AX Code remains the sole coding worker and owner of coding sessions, tools, goals, task state,
verification, worktrees, and runtime contracts. AX Agent may own durable domain-neutral manager runs only after a
released, versioned contract is available. AX Trust remains the owner of enterprise credentials, grants, policy, and
immutable audit.

Desktop production source moves one way to AX Coder through an additive extraction. AX Code retains its source until
the independent build, packaging, upgrade, rollback, and release-ownership gates pass. It then removes the duplicate
implementation in a paired change while retaining only intentional clients and contracts.

AX Coder does not import AX Code runtime source. Production integrations use a released SDK and a pinned signed AX Code
runtime artifact. No phase authorizes automatic merge, release, permission expansion, credential access, or budget
increase.

## Consequences

- Repository ownership and product branding can evolve independently from runtime compatibility.
- The first extraction is behavior-preserving and cannot add portfolio autonomy.
- Cross-repository commits and compatibility versions become required release evidence.
- AX Code remains fully usable without AX Coder.

## Rollback

Before source removal, abandon the AX Coder candidate and continue releasing Desktop from AX Code. After cutover, use
the last verified compatible AX Coder artifact and its documented data-preserving rollback path.
