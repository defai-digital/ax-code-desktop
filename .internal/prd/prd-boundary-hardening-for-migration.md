# PRD: Boundary Hardening for Easier Migration and Lower Bug Risk

**Status:** Draft  
**Author:** Product  
**Date:** 2026-06-09  
**Target Release:** 2026.06.x (pre-feature milestone)  
**Related:** [ADR-011](../adr/ADR-011-boundary-hardening-before-feature-migration.md), [Tech Spec](../tech-spec/tech-spec-boundary-hardening-for-migration.md)

---

## Problem

AX Code Desktop currently has mixed architectural boundaries that make new feature work and future migration more error-prone:

- `web` currently imports from `../ui/src` directly, hiding ownership and contract boundaries.
- `desktop` (Tauri-era package) is still present in repo shape and some release logic, increasing confusion over active runtime path.
- Internal implementation details can be unintentionally included in release artifacts if checks or manifests drift.
- Legacy aliasing (`@openchamber/*`, process naming) still leaks into active code paths, making refactors harder.

## Vision

Establish explicit package ownership before the next major feature cycle so each change is scoped to one clear layer, with contracts and release checks guarding boundaries.

The app should feel like:

- UI changes happen in `packages/ui`.
- Runtime behavior changes happen in `packages/web`.
- Shell and packaging changes happen in `packages/electron`.
- Legacy packages are clearly marked and excluded from active feature/release paths.

## Success Metrics

| Metric | Current (est.) | Target |
|---|---|---|
| Cross-layer imports through direct file paths (`../ui/src`, `../desktop/...`) | Present | Removed from active runtime/shell flows |
| Active release inputs from legacy `desktop` package | Present/implicit | Zero |
| Runtime build/lint coverage of JavaScript/TS server and script files | Partial | Full with explicit lint scope across relevant packages |
| `@openchamber/*` references in active code | Present | Removed from new/active feature files |
| `.internal` tracked by build/publish checks | Historical leakage risk | Guarded by boundary preflight + release workflows |

## User / Team Outcomes

1. **Developers** can add features with low cognitive load by touching a target package with clear ownership.
2. **Release and migration work** can proceed without changing unrelated areas.
3. **QA** can run targeted checks by layer, with fewer false positives caused by boundary ambiguity.

## Scope

### In Scope

- Define and document package ownership boundaries (UI, runtime, shell).
- Add explicit boundary checks to prevent `.internal` from being published or packaged.
- Phase out direct source imports from `web` into `ui`.
- Keep legacy `desktop` package outside active release/build workflows and migration-critical paths until intentionally retired.
- Normalize naming/alias usage in active code to preferred AX Code conventions.

### Out of Scope

- New feature implementation in `packages/ui`, `packages/web`, or `packages/electron`.
- Full removal of `desktop` from git history.
- Replacement of any business logic that is not boundary-related.

## Functional Requirements

1. Boundary classification:
   - `packages/ui`: presentation and app state, no process lifecycle responsibilities.
   - `packages/web`: API endpoints, config orchestration, background runtime lifecycle.
   - `packages/electron`: shell startup and packaging contract only.
2. Boundary-safe imports:
   - Active code paths must import through package entry points, not raw local source from sibling packages.
3. Legacy isolation:
   - `desktop` package references in release and runtime startup flows are identified and gated behind a migration exception file, then removed.
4. Publication safety:
   - Release and package publish scripts include clear allowlists and fail-closed checks.

## Non-Functional Requirements

- Boundary checks must execute in local preflight and CI/release contexts.
- New checks should be lightweight and deterministic.
- Decisions should preserve one-step rollback with compatibility toggles for existing dev workflows.

## Risks

| Risk | Mitigation |
|---|---|
| Refactor touches many files and causes temporary instability | Roll out in small slices with temporary compatibility shims. |
| Legacy scripts that still rely on `desktop` paths fail | Keep explicit compatibility path only for transitional scripts, then remove after confirmation. |
| Build times increase due to broader lint scopes | Keep scope tight per-package first; expand after baseline green check passes. |

## Dependencies

- `packages/ui`, `packages/web`, `packages/electron` package metadata.
- Release workflow files and package `files`/`app` manifests.
- Lint/build tooling for package boundaries.

## Acceptance Criteria

- PR review checklist can verify ownership for any touched file by layer.
- A newly added feature PR can be categorized without cross-layer ambiguity.
- Release candidate build excludes `.internal` and any compatibility-only paths by automated check.
- No active feature file imports `../ui/src` directly.

## Open Questions

- Should `packages/desktop` be kept as `packages/desktop-legacy` or moved under `.internal/reference` first?
- Is the first major milestone a pure boundary enforcement slice, or should feature parity work begin simultaneously with boundary cleanup?
