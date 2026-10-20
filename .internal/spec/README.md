# AX Code Desktop technical specification index

Reviewed 2026-10-19 (`../reports/GOVERNANCE-2026-10-19-rebaseline.md`). Each specification keeps its original status
line. The "Current interpretation" column records what is true now, using code and release evidence; it does not edit
the accepted text. Older records use the former name "AX Coder" (ADR-015).

## Active

Current testing extension: [Desktop E2E Harness v2](SPEC-2026-10-19-desktop-e2e-harness-v2.md), accepted for the 2026-10-19 testing/CI improvement. Extends v1 with reload, retained CSP history, exception detection, failure injection and explicit CI result aggregation; preserves advisory qualification.

| Spec                                                                                        | Current interpretation                                                            | Related                                  |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------- |
| [AX Code JSR SDK Consumption](SPEC-2026-09-02-ax-code-jsr-sdk-consumption.md)               | Implemented and verified                                                          | ADR-001                                  |
| [Desktop Source Extraction and Provenance](SPEC-2026-09-02-desktop-source-extraction.md)    | Implemented and verified                                                          | ADR-002; ADR-003                         |
| [Independent Desktop Workspace](SPEC-2026-09-02-independent-desktop-workspace.md)           | Implemented and verified                                                          | ADR-001; ADR-003; ADR-004                |
| [AX Code Worker Contract](SPEC-2026-09-02-ax-code-worker-contract.md)                       | Accepted; consumed through the pinned SDK in every release since extraction       | ADR-001; ADR-004                         |
| [Desktop and Portfolio Process Model](SPEC-2026-09-02-desktop-process-model.md)             | Accepted; extraction behavior locked                                              | ADR-005                                  |
| [Desktop Source-Ownership Cutover](SPEC-2026-09-02-source-ownership-cutover.md)             | Implemented and verified                                                          | ADR-008                                  |
| [Desktop Release Migration and Rollback](SPEC-2026-09-02-release-migration-and-rollback.md) | Implemented; rollback receipts recorded for 7.27.3                                | ADR-004; ADR-006                         |
| [User Data and Identity Continuity](SPEC-2026-09-02-user-data-and-identity-continuity.md)   | Implemented; continuity receipts recorded for 7.27.3                              | ADR-006                                  |
| [Desktop Localization v1](SPEC-2026-10-11-desktop-localization-v1.md)                       | Implemented: 14 locales in `desktop/shared/locales.json`; direction fixed to LTR  | PRD competitive quality (RTL is Phase 2) |
| [Embedded Native WebMCP v1](SPEC-2026-10-11-embedded-native-webmcp-v1.md)                   | Implemented provider contract; Windows targets are x64 only (ADR-010)             | ADR-009 (WebMCP)                         |
| [Desktop Download Distribution v3](SPEC-2026-10-12-desktop-download-distribution-v3.md)     | Current distribution contract, extended by v4                                     | ADR-010; ADR-012                         |
| [Desktop Download Distribution v4](SPEC-2026-10-13-desktop-download-distribution-v4.md)     | Current addendum within the ADR-012 policy                                        | ADR-012                                  |
| [Public Signed Shadow](SPEC-2026-10-12-public-signed-shadow.md)                             | Implemented; cross-platform execution recorded for 7.27.3                         | ADR-011                                  |
| [Desktop Notarization Credentials](SPEC-2026-10-12-desktop-notarization-credentials.md)     | Implemented; hosted signed qualification recorded for 7.27.3                      | ADR-006; ADR-011                         |
| [Public Desktop Release Cutover](SPEC-2026-10-12-public-desktop-release-cutover.md)         | Implemented; each later release still needs its own exact-candidate qualification | ADR-012                                  |
| [Browser Entrypoint Routing](SPEC-2026-10-13-browser-entrypoint-routing.md)                 | Implemented                                                                       | ADR-013                                  |
| [Desktop Visual System v1](SPEC-2026-10-13-desktop-visual-system-v1.md)                     | Implemented (the file records all stages)                                         | —                                        |
| [Analysis Routing v2](SPEC-2026-10-18-analysis-routing-v2.md)                               | Implemented; supersedes the executable contract of analysis handoff v1            | ADR-017                                  |
| [Mermaid Capabilities v2](SPEC-2026-10-19-mermaid-capabilities-v2.md)                       | Implemented and shipped in 7.27.3; versioned capability contract                  | AGENTS.md                                |
| [Renderer Security Baseline v1](SPEC-2026-10-19-renderer-security-baseline-v1.md)           | Accepted 2026-10-19; implemented                                                  | ADR-018                                  |
| [Desktop End-to-End Harness v1](SPEC-2026-10-19-desktop-e2e-harness-v1.md)                  | Accepted 2026-10-19; implemented; CI steps non-blocking                           | PRD competitive quality                  |
| [Desktop IPC Contract v2](SPEC-2026-10-19-desktop-ipc-contract-v2.md)                       | Accepted 2026-10-19; validator, generator and first batch implemented             | ADR-019                                  |
| [Supervision Pop-out v1](SPEC-2026-10-19-supervision-popout-v1.md)                          | Accepted 2026-10-19; amends the process model with one window type                | PRD supervision v3                       |
| [Multi-run Identity v1](SPEC-2026-10-19-multirun-identity-v1.md)                            | Accepted 2026-10-19                                                               | PRD supervision v3                       |
| [Desktop Localization v2](SPEC-2026-10-19-desktop-localization-v2.md)                       | Accepted 2026-10-19; direction support without a new locale                       | PRD competitive quality                  |

## Deferred

| Spec                                                                                        | Current interpretation                                                | Related          |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ---------------- |
| [Portfolio State and Reconciliation](SPEC-2026-09-02-portfolio-state-and-reconciliation.md) | Accepted design; not built. Supervision ships as renderer projections | ADR-005; ADR-007 |
| [Contract Authority and Dispatch](SPEC-2026-09-02-contract-authority-and-dispatch.md)       | Accepted design; not built                                            | ADR-002; ADR-007 |

## Historical

| Spec                                                                                          | Disposition                                                                                                              |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| [Desktop Download Distribution v1](SPEC-2026-10-11-desktop-download-distribution-v1.md)       | Preparation record; superseded by v3 and v4                                                                              |
| [Desktop Download Distribution v2](SPEC-2026-10-12-desktop-download-distribution-v2.md)       | Preparation record; its disabled-publication state ended with ADR-012                                                    |
| [Independent Release Preparation](SPEC-2026-10-11-independent-desktop-release-preparation.md) | Preparation record; release freeze superseded by ADR-012                                                                 |
| [Electron 45 Candidate v1](SPEC-2026-10-11-electron-45-candidate-v1.md)                       | Qualification experiment (`d8b11c78`); the shipping pin is Electron 44.9.0. A new spec governs the next Electron upgrade |
| [Analysis App Handoff v1](SPEC-2026-10-18-analysis-app-handoff-v1.md)                         | Executable contract superseded by analysis routing v2                                                                    |
| [Mermaid Capabilities v1](SPEC-2026-10-18-mermaid-capabilities-v1.md)                         | Preserved accepted inventory; v2 is current                                                                              |

- [Reliable model downloads](SPEC-2026-10-19-reliable-model-downloads.md): Accepted; scoped login-shell environment forwarding for the supervised runtime.
