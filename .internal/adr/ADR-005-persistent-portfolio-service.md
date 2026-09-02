# ADR-005: Use a Separate Local Portfolio Service

| Field          | Value                                                                                                 |
| -------------- | ----------------------------------------------------------------------------------------------------- |
| Status         | Accepted                                                                                              |
| Implementation | Deferred until read-only portfolio slice                                                              |
| Date           | 2026-09-02                                                                                            |
| Deciders       | User; AX Coder maintainers                                                                            |
| Related        | Active PRD; SPEC-2026-09-02-portfolio-state-and-reconciliation; SPEC-2026-09-02-desktop-process-model |

## Context

Portfolio reconciliation must survive renderer reloads and may continue when no window is open. Electron main already
owns one AX Code sidecar lifecycle, but tying portfolio durability to a renderer or adding another general web proxy
would repeat a process model that AX Code Desktop deliberately removed.

## Decision

AX Coder will use a single-purpose local portfolio service as a separately managed loopback process. It owns only
project registration, desired state, projections, cursors, exceptions, reconciliation metadata, and product leases.
Electron main is its authenticated UI client and remains the supervisor for per-project AX Code sidecars used by an
active Desktop session.

The service exposes a versioned schema over authenticated loopback IPC or HTTP. It persists before acknowledging state
changes, resumes cursors after restart, and performs deterministic reconciliation. It does not host coding tools,
provider credentials, a second AX Code API proxy, or a domain-neutral agent loop.

The ten-minute sweep is a bounded safety net. Unchanged desired state and event cursors produce `no_op` without a model
call. Primary wakes are event-driven. Manager execution remains disabled until ADR-007's dependency gate is satisfied.

## Consequences

- Closing a window does not define portfolio durability.
- Portfolio product data remains separate from AX Code execution truth and future AX Agent run history.
- Installation and lifecycle integration are more complex than an in-renderer store and require platform smoke tests.

## Rollback

Disable service autostart and run AX Coder as the existing single-project Desktop client. The service database remains
read-only and exportable; rollback never deletes project or exception state.
