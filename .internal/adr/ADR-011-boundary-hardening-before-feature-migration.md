# ADR-011: Boundary Hardening Before Feature Expansion

**Status:** Proposed  
**Date:** 2026-06-09  
**Deciders:** Engineering, Product  
**Related:** [PRD](../prd/prd-boundary-hardening-for-migration.md), [Tech Spec](../tech-spec/tech-spec-boundary-hardening-for-migration.md)

---

## Context

AX Code Desktop is adding new features while still carrying mixed responsibilities across `ui`, `web`, `electron`, and legacy `desktop` paths.

Current risks:

- Boundary drift (UI and backend logic coupled through direct source imports and legacy aliases).
- Legacy package confusion (`@openchamber/*`, Tauri updater flow inside Electron flow).
- Inconsistent lint/build coverage across package roots.
- Public release surfaces that can accidentally pick up internal/non-shippable concerns.

A clean boundary first is needed so future migrations (including architecture or runtime changes) do not amplify this coupling.

---

## Decision

Adopt a **three-layer boundary model** before the next feature wave:

1. `packages/ui` is the presentation domain: React UI, stores, reusable UI utilities.
2. `packages/web` is the runtime domain: API handlers, process orchestration, server coordination.
3. `packages/electron` is the shell/distribution domain: main process, updater hooks, installer config.

`packages/desktop` is treated as legacy migration technical debt: retained for local history/review only and explicitly excluded from active CI release paths until renamed/refactored into an archival compatibility area.

Architectural guardrails:

- No direct `../ui/src` imports from runtime packages; all cross-boundary references must go through package exports.
- Legacy `@openchamber/*` aliases are retained only inside a dedicated compatibility shim and are removed from active product code.
- `.internal` remains private and non-publishable; internal artifacts must not be referenced by publish/build manifests.

---

## Rationale

### Why boundary-first now

Future migration work becomes expensive when boundaries are implicit. Formalizing ownership lowers migration risk by making every feature owner ask:

- Which layer owns the behavior?
- What API contract must remain stable?
- Which layer is allowed to change for this work?

### Why keep `desktop` as explicit legacy

Deleting it immediately would erase migration context and risks breaking historical references. Keeping it as explicit legacy, but out of active release/build paths, reduces immediate breakage while still enabling incremental cleanup.

### Why keep package-export-based composition

Source imports across package boundaries bypass package metadata and make ownership invisible to tooling. Requiring package exports and public contracts lets migration scripts, static analysis, and build tooling reason about coupling.

---

## Alternatives Considered

### A. Add features first and normalize boundaries later

- Pro: fastest short-term throughput.
- Con: increases long-tail coupling debt and slows or invalidates migration steps later.
- **Rejected** because it preserves the current ambiguity and repeats avoidable bugs.

### B. Full rewrite into a new package architecture

- Pro: clean break.
- Con: high migration risk and too much context switching while feature work is expected.
- **Rejected** for now; the repo is stable enough for incremental boundary extraction.

### C. Keep `desktop` as active release path while layering docs around it

- Pro: minimal process change.
- Con: doesn't reduce release/build ambiguity and can keep migration blockers invisible.
- **Rejected** because it preserves contradictory release ownership.

---

## Consequences

### Positive

- New features map to clear owners and review points (`ui`, `web`, `electron`).
- Migration complexity drops because interface contracts are explicit before rewrite work.
- Debug scope becomes clearer: front-end regressions, runtime regressions, and shell regressions are isolated by default.

### Negative

- The first migration step is disruptive for tooling: package import references and lint/build scripts must be touched across many modules.
- Some existing tests and docs may require relocation to match new boundary ownership.

### Migration Guardrails (accepted with this ADR)

- `npm/bun publish` and release packaging checks fail on accidental inclusion of files outside the published contract.
- CI or local release preflight checks must fail if `.internal` files are tracked in source control.

---

## Implementation Linkage

- Follow this PRD: [prd-boundary-hardening-for-migration.md](../prd/prd-boundary-hardening-for-migration.md)
- Follow this Tech Spec: [tech-spec-boundary-hardening-for-migration.md](../tech-spec/tech-spec-boundary-hardening-for-migration.md)

