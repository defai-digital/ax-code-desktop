# AX Coder ADR index

| ADR                                                              | Title                                                          | Status   | Implementation                        | Date       |
| ---------------------------------------------------------------- | -------------------------------------------------------------- | -------- | ------------------------------------- | ---------- |
| [ADR-001](ADR-001-ax-code-jsr-sdk-consumption.md)                | Consume the AX Code SDK from JSR                               | Accepted | Implemented and verified              | 2026-09-02 |
| [ADR-002](ADR-002-product-and-source-boundary.md)                | Establish the AX Coder product and source boundary             | Accepted | Phases 1-2 complete; Phase 3 pending  | 2026-09-02 |
| [ADR-003](ADR-003-history-preserving-desktop-extraction.md)      | Extract Desktop with filtered Git history                      | Accepted | Complete                              | 2026-09-02 |
| [ADR-004](ADR-004-sdk-runtime-and-release-order.md)              | Pin SDK and runtime with producer-first releases               | Accepted | Initial pair implemented and verified | 2026-09-02 |
| [ADR-005](ADR-005-persistent-portfolio-service.md)               | Use a separate local portfolio service                         | Accepted | Deferred to read-only portfolio slice | 2026-09-02 |
| [ADR-006](ADR-006-application-identity-and-release-ownership.md) | Preserve application identity during source transfer           | Accepted | Shadow release required               | 2026-09-02 |
| [ADR-007](ADR-007-defer-ax-agent-manager-integration.md)         | Defer manager execution until AX Agent has a released contract | Accepted | Deferred                              | 2026-09-02 |

ADRs must identify the decision owner, contracts, superseded records, rollout, and rollback.
