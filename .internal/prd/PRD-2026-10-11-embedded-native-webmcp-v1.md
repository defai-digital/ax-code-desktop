# PRD: Embedded Native WebMCP, Version 1

| Field | Value |
| --- | --- |
| Status | Proposed; product requirement requested, architecture acceptance pending |
| Date | 2026-10-11 |
| Owners | AX Coder desktop; AX Code tools and worker contract |
| Related | ADR-002; ADR-004; proposed ADR-009; embedded WebMCP spec v1 |

## Requirement and authorization

The user requested Chrome-standard WebMCP inside AX Coder without requiring users to install Chrome.
This proposal adds that requirement to the accepted extraction baseline without rewriting it.
Research and a disposable native capability probe are complete. Acceptance of this PRD and the paired
ADRs must precede production integration under AGENTS.md. No release, permission expansion, or
SDK/runtime publication is authorized by this document.

## User experience

AX Coder ships the compatible browser engine as part of its desktop package. A user opens a visible
project browser inside AX Coder and explicitly enables agent access. The coding session discovers
and invokes tools registered by the website through native WebMCP. No Chrome installation, extension,
manual experimental flag, external browser window, or browser download during first use is required.

The browser shows its project, current origin, connection status, pending actions, and a disconnect
control. Approval details show the actual target origin and operation. Unsupported websites continue
to work as ordinary pages and show that they expose no WebMCP tools. Unsupported runtime versions
show an actionable compatibility state; they never claim the embedded browser is ready for agents.

Manual browsing and agent authorization remain distinct. A website's annotations never grant
permission. Existing AX Code permission rules and managed restrictions remain authoritative.

## Ownership

- AX Coder owns the native browser surface, native protocol adapter, view lifecycle, and UI projections.
- AX Code owns tool exposure, session dispatch, permissions, policy enforcement, budgets, and evidence.
- Published SDK and signed worker capabilities connect them. AX Coder does not copy AX Code's bridge,
  permission engine, workflow runner, or approval persistence.
- AX Trust remains the authority for enterprise policy and credentials. No new AX Agent dependency.

## Acceptance criteria

1. A packaged installation works on a machine with no Chrome executable or browser profile present.
2. Imperative registration and declarative forms use native Chromium behavior. No page API polyfill,
   private alternative registration API, or user-agent spoofing establishes compatibility.
3. AX Code completes discovery and invocation through its existing tool and permission lifecycle.
4. The bridge cannot enumerate the portfolio UI, another project, or an unrelated application window.
5. Refresh, navigation, tool replacement, disconnect, crash, and project change invalidate stale calls.
6. Denial, cancellation, oversized responses, cross-origin access, and unavailable APIs fail closed.
7. The packaged engine, SDK, and worker have exact versions, integrity, provenance, and compatible
   contract evidence. Existing signing, identity, update, rollback, and shadow-release gates still apply.
8. Native macOS, Windows, and Linux tests and Chrome-free package evidence precede any support claim.

## Delivery order

1. Accept this PRD, AX Coder ADR-009, and the producer ADR in AX Code.
2. AX Code implements and publishes the provider contract and signed compatible worker.
3. AX Coder pins those releases and upgrades the bundled Electron engine after regression testing.
4. Implement a dedicated native project browser and adapter; integrate UI with authoritative runtime events.
5. Qualify adversarial cases, packaged Chrome-free installations, and data-preserving upgrade/rollback.

The research candidate is Electron 44.7.0 / Chromium 152. It is not yet the production pin. The probe
demonstrates engine feasibility on macOS arm64, not end-to-end AX Code integration or release readiness.
