# ADR-007: Defer Project-Manager Execution Until AX Agent Exposes a Released Contract

| Field          | Value                                   |
| -------------- | --------------------------------------- |
| Status         | Accepted                                |
| Implementation | Deferred                                |
| Date           | 2026-09-02                              |
| Deciders       | User; AX Coder and AX Agent maintainers |
| Related        | Active PRD; ADR-002; ADR-005            |

## Context

AX Agent v0.2 has a useful local durable runtime scaffold, but its current checkout is uncommitted and does not expose
a released project-manager contract, coding capability pack, MCP integration, or cross-project workflow guarantees.
Treating planned capabilities as available would make AX Coder's durability and recovery claims unverifiable.

## Decision

AX Coder does not take a production dependency on AX Agent during Desktop extraction or the read-only portfolio slice.
It observes AX Code through released contracts and may implement deterministic product reconciliation without invoking
a manager model.

Proposal-only project-manager work begins only after AX Agent publishes a versioned service or SDK contract covering
durable runs, events, approvals, cancellation, leases, idempotency, and restart recovery with consumer contract tests.
No temporary AX Coder agent loop will duplicate those semantics. If a later milestone needs a temporary adapter, a new
ADR must name its owner, restricted capability, removal version, and proof that the same run cannot execute twice.

## Consequences

- History extraction and read-only multi-project status can progress independently.
- Proposal and dispatch phases remain honestly blocked on a producer contract rather than mocks.
- AX Code is not expanded into a portfolio manager as a workaround.

## Revisit condition

Revisit when AX Agent has a clean committed release, published contract artifacts, and passing AX Coder consumer tests.
