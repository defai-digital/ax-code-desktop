# Tech Spec: Boundary Hardening for Migration Readiness

**Status:** Draft  
**Author:** Engineering  
**Date:** 2026-06-09  
**Related:** [ADR-011](../adr/ADR-011-boundary-hardening-before-feature-migration.md), [PRD](../prd/prd-boundary-hardening-for-migration.md)

---

## Overview

This spec defines the implementation plan for an explicit three-layer boundary before feature expansion:

1. UI layer (`packages/ui`)
2. Runtime layer (`packages/web`)
3. Shell layer (`packages/electron`)

Boundary correctness is enforced through import discipline, release allowlists, and explicit legacy isolation for `packages/desktop`.

---

## Current State Mapping

- `packages/web` imports UI source directly through path aliases and `../ui/src`.
- `packages/electron` and `packages/desktop` have overlapping concerns in process/build flows.
- Some release artifacts still include references to legacy naming and packages not part of the active runtime path.
- Internal docs are present locally but some historical files were previously tracked, requiring stronger boundary checks.

---

## Implementation Approach

### Workstream A — Clarify package ownership

Goal: make ownership explicit in metadata and developer-facing docs.

1. Create/confirm package role docs in root notes (not included in release inputs).
2. Add explicit ownership comments in package manifests:
   - `packages/ui/package.json`: `"name"` and `exports` should describe UI-only usage.
   - `packages/web/package.json`: server/runtime contracts described in entry points and scripts.
   - `packages/electron/package.json`: shell/distribution-only scripts and artifacts.
3. Add migration notes for `packages/desktop` as legacy and optional archive-only path.

### Workstream B — Enforce import boundaries

Goal: remove implicit coupling between packages.

#### Step B1: Remove direct source imports

- Replace imports of `../ui/src` from `packages/web` with package imports via configured workspace resolution.
- Replace broad alias usage that references legacy roots in active code.
- Keep legacy compatibility alias map in one small compatibility layer for transitional modules only.

#### Step B2: Verify boundary via lint script

- Expand lint scope to include `.js`/`.ts` server entry points currently excluded from TS-only lint passes.
- Add targeted import-restriction rule (or script check) to fail builds when sibling package source is imported directly.

### Workstream C — Legacy package isolation

Goal: avoid accidental runtime/release ambiguity.

- Mark `packages/desktop` as migration-only:
  - remove it from active build/release docs/tests.
  - keep only historical/process-specific compatibility notes.
  - gate all references behind a migration checklist until removed or repurposed.

### Workstream D — Internal boundary hardening

Goal: never publish internal docs/review assets.

- Keep `.internal` in `.gitignore` and `.dockerignore`.
- Add/retain repo preflight that checks tracked files and fails if any `.internal/*` file is in Git index.
- Ensure package `files`/publish manifests and Electron packaging resources do not include `.internal`.
- Add a release step-level check in `docs-source` and package publish workflows.

### Workstream E — Release and CI contract checks

- Add a small, deterministic boundary CI check:
  - package allowlists only include intended runtime/shell outputs.
  - no legacy `desktop` or internal-only directories are staged in artifacts.
- Require PR templates/checklist fields for ownership (`ui`, `web`, `electron`).

---

## File-Level Changes (Representative)

### `packages/web/vite.config.ts`

- Replace direct aliases to `../ui/src` with package boundary aliases pointing at stable package entry points.
- Keep `@openchamber/*` aliases only in transitional compatibility modules.

### `packages/web/tsconfig.json`

- Update path mappings to consume workspace package contracts instead of direct source paths for runtime imports.

### `packages/web/package.json`

- Validate `files` field to include only shippable runtime outputs.
- Ensure `private` + scripts reflect release policy and boundary checks.

### `packages/electron/package.json`

- Keep shell-level scripts only; no runtime ownership overlap.
- Ensure lint/type-check scripts are aligned to current Electron surface.

### `.github/workflows/release.yml` + package scripts

- Run boundary preflight before release.
- Verify no `.internal` files in tracked index and no legacy package payload in distribution.

### `packages/desktop/**`

- Convert to explicit legacy reference area or remove from active release inputs.
- Add deprecation note and migration timeline in package README.

---

## Migration Sequence

1. **Week 1:** Boundary audit + import detection script + compatibility shim plan.
2. **Week 2:** Import refactor (`web -> ui`) + lint rule rollout.
3. **Week 3:** `desktop` legacy isolation and release workflow de-risking.
4. **Week 4:** Internal boundary hardening validation in release and packaging.
5. **Week 5:** Smoke test + review and ADR checkpoint.

---

## Validation Plan

- `preflight`: check internal boundary and tracked file policy.
- Boundary lint: no direct sibling-source imports in active layers.
- Release dry-run: verify package payload path lists exclude `.internal` and legacy directories.
- Manual QA:
  - launch flow from renderer to runtime works after import cleanup,
  - shell packaging artifacts build and run,
  - no functional regression in config reload/provider flows.

---

## Rollback Plan

- Keep compatibility shims in place during Week 1-3 transitions.
- If import breakage appears, temporarily allow a single compatibility alias and add a TODO with date for removal.
- Revert Workstream slices independently:
  - boundary alias changes,
  - legacy package isolation,
  - lint enforcement.

---

## Open Questions

- Should the first cut use TypeScript project references in `tsconfig` for stronger ownership checks?
- Do we keep `packages/desktop` as `packages/desktop-legacy` or move it into `.internal/reference` first?
- Which third-party package names should be allowed to remain in release manifests unchanged?

