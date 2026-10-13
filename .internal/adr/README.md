# AX Coder ADR index

| ADR                                                              | Title                                                          | Status   | Implementation                         | Date       |
| ---------------------------------------------------------------- | -------------------------------------------------------------- | -------- | -------------------------------------- | ---------- |
| [ADR-001](ADR-001-ax-code-jsr-sdk-consumption.md)                | Consume the AX Code SDK from JSR                               | Accepted | Implemented and verified               | 2026-09-02 |
| [ADR-002](ADR-002-product-and-source-boundary.md)                | Establish the AX Coder product and source boundary             | Accepted | Phases 1-2 complete; Phase 3 active    | 2026-09-02 |
| [ADR-003](ADR-003-history-preserving-desktop-extraction.md)      | Extract Desktop with filtered Git history                      | Accepted | Complete                               | 2026-09-02 |
| [ADR-004](ADR-004-sdk-runtime-and-release-order.md)              | Pin SDK and runtime with producer-first releases               | Accepted | Initial pair implemented and verified  | 2026-09-02 |
| [ADR-005](ADR-005-persistent-portfolio-service.md)               | Use a separate local portfolio service                         | Accepted | Deferred to read-only portfolio slice  | 2026-09-02 |
| [ADR-006](ADR-006-application-identity-and-release-ownership.md) | Preserve application identity during source transfer           | Accepted | Guards ready; shadow execution pending | 2026-09-02 |
| [ADR-007](ADR-007-defer-ax-agent-manager-integration.md)         | Defer manager execution until AX Agent has a released contract | Accepted | Deferred                               | 2026-09-02 |
| [ADR-008](ADR-008-source-cutover-with-release-freeze.md)         | Separate Desktop source cutover from public release cutover    | Accepted | Implemented and verified               | 2026-09-02 |
| [ADR-011](ADR-011-public-signed-shadow-qualification.md) | Public signed shadow qualification | Accepted | Local implementation verified; platform execution pending | 2026-10-12 |
| [ADR-012](ADR-012-public-desktop-release-cutover.md) | Public Desktop release cutover | Accepted | Implementation and native qualification in progress | 2026-10-12 |

ADRs must identify the decision owner, contracts, superseded records, rollout, and rollback.

| [ADR-013](ADR-013-browser-entrypoint-routing.md) | Browser Entrypoint Routing | Accepted | Implementation in progress | 2026-10-13 |
