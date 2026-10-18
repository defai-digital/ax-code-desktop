# AX Code Desktop ADR index

Reviewed 2026-10-18. Accepted decisions remain authoritative unless a later decision explicitly supersedes a clause. Implementation dates and old release versions in accepted records are historical, not live deployment evidence.

| ADR | Standing and supersession scope |
| --- | --- |
| [ADR-001: JSR SDK](ADR-001-ax-code-jsr-sdk-consumption.md) | Active exact published SDK consumption boundary; historical version is not the current pin |
| [ADR-002: Product/source boundary](ADR-002-product-and-source-boundary.md) | Active; source-removal ordering amended by ADR-008; naming interpreted through ADR-015 |
| [ADR-003: History-preserving extraction](ADR-003-history-preserving-desktop-extraction.md) | Completed extraction decision; history/provenance remain protected |
| [ADR-004: Producer-first release order](ADR-004-sdk-runtime-and-release-order.md) | Active SDK/runtime and qualification order |
| [ADR-005: Portfolio service](ADR-005-persistent-portfolio-service.md) | Deferred; renderer projections do not constitute service delivery |
| [ADR-006: Identity and release ownership](ADR-006-application-identity-and-release-ownership.md) | Active identity/continuity requirements; ordering partially superseded by ADR-008 |
| [ADR-007: AX Agent integration](ADR-007-defer-ax-agent-manager-integration.md) | Deferred pending the released canonical contract |
| [ADR-008: Source cutover](ADR-008-source-cutover-with-release-freeze.md) | Implemented source ownership; subsequent publication authority is ADR-012 |
| [ADR-009 (release): Independent preparation](ADR-009-independent-desktop-release-preparation.md) | Historical preparation; release freeze superseded by ADR-012 only |
| [ADR-009 (WebMCP): Embedded provider](ADR-009-embedded-native-webmcp-provider-v1.md) | Active provider boundary; extended by ADR-013 and ADR-014 |
| [ADR-010: Distribution](ADR-010-desktop-download-distribution.md) | Active distribution invariants; private-source qualification assumption superseded by ADR-011, updater freeze by ADR-012 |
| [ADR-011: Signed shadow qualification](ADR-011-public-signed-shadow-qualification.md) | Active public-repository signing and qualification requirements |
| [ADR-012: Public release cutover](ADR-012-public-desktop-release-cutover.md) | Active publication authority with exact-inventory native qualification gates |
| [ADR-013: Browser routing](ADR-013-browser-entrypoint-routing.md) | Active CLI/Desktop browser separation |
| [ADR-014: Agent page interaction](ADR-014-agent-page-interaction.md) | Active page-interaction boundary; paired producer ADR-198 exists |
| [ADR-015: Product naming](ADR-015-product-name-ax-code.md) | Active product name and compatibility identity requirements |

## Archived proposals

[Embedded provider producer proposal](archive/AX-CODE-ADR-PROPOSAL-2026-10-11-embedded-webmcp-transport-v1.md): historical draft, now represented by accepted AX Code ADR-184. It is not an outstanding approval request.

The duplicate ADR-009 numbers are historical. Use full filenames or the qualified labels above; accepted records were not renumbered. See the [lifecycle review](../reports/GOVERNANCE-2026-10-18-document-lifecycle.md) for evidence and preservation receipts.

- [ADR-016: Analysis app handoff](ADR-016-analysis-app-handoff.md): Accepted; paired AX Code ADR-256.
