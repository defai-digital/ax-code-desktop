# ADR-008: Search and Index Ownership

**Status:** Proposed
**Date:** 2026-06-06
**Deciders:** Engineering, Product
**Related:** [PRD](../prd/prd-desktop-search-index-consolidation.md), [Tech Spec](../tech-spec/tech-spec-desktop-search-index-consolidation.md), [ADR-004](ADR-004-file-search-tauri-command.md), [ADR-005](ADR-005-rust-migration-scope-boundaries.md)

---

## Context

AX Code Desktop is a UI runtime for AX Code server. The UI communicates with AX Code through HTTP/SSE via the vendored `@ax-code/sdk`.

The current repository contains overlapping search and filesystem mechanisms:

- AX Code server exposes `find.files` and emits `code.index.progress` / `code.index.state`.
- UI file search surfaces call `useFileSearchStore.searchFiles()`, which ultimately calls AX Code `find.files`.
- Shared desktop helpers still try a Tauri-native search command for file-only queries.
- Legacy Tauri implements `desktop_search_files` using Rust and the `ignore` crate.
- Forward Electron exposes a Tauri-compatible IPC bridge, but does not implement `desktop_search_files`.
- The web server has a separate `fs/search.js` traversal runtime used by project icon discovery.
- Files view periodically refreshes expanded local directories.

The user concern is that the desktop app is slow and may be doing search/index work that AX Code already does.

---

## Decision

AX Code server is the owner of project search, code search, and indexing.

AX Code Desktop must not maintain a separate project search/index pipeline for normal file search. The desktop app should:

1. Delegate normal file search to AX Code `find.files`.
2. Delegate text/symbol/semantic/code graph work to AX Code.
3. Use desktop/web local filesystem APIs only for bounded shell and file-browser operations.
4. Avoid probing unsupported native commands in Electron.
5. Bound or remove local full-tree scans that duplicate AX Code search.

This supersedes ADR-004 as the forward-path recommendation. ADR-004 remains useful historical context for the legacy Tauri shell, but new performance work should not invest in Tauri-native search unless Tauri becomes the forward desktop shell again.

---

## Rationale

### AX Code already owns the hard search/index problem

AX Code has the runtime context needed to answer file, text, symbol, and code intelligence queries consistently. Duplicating that in the desktop shell creates ranking drift, ignore-rule drift, separate caches, and extra IO.

### Electron is the forward desktop path

Optimizing legacy Tauri search does not help the active Electron product path unless the same command exists in Electron. Today, Electron pays an avoidable failed IPC attempt before falling back to AX Code search.

### Local filesystem work is still necessary, but should be bounded

Files view, read/write, reveal/open, and project selection are real desktop responsibilities. They should inspect explicit paths and visible directories, not maintain a global project search index.

### Fewer search paths make performance easier to diagnose

When all normal search goes through AX Code, slow search can be measured and fixed at the server/index layer. If desktop performs its own scanning at the same time, performance symptoms become harder to attribute.

---

## Alternatives Considered

### A. Continue Tauri Native Search as the Main Optimization

**Pros**

- Rust `ignore::WalkBuilder` is fast and avoids `git check-ignore` subprocess spawns.
- Tauri IPC avoids localhost HTTP overhead.
- Existing legacy implementation and tests already exist.

**Cons**

- It optimizes the legacy shell, not the Electron forward path.
- It duplicates AX Code `find.files`.
- It creates two file search ranking implementations.
- It keeps search correctness split across desktop and server.
- It does not address text/symbol/semantic index ownership.

**Decision:** Rejected for forward work.

### B. Add Electron-Native File Search IPC

**Pros**

- Could remove failed IPC and provide a fast local path in Electron.
- May be useful for offline file picker behavior before AX Code readiness.

**Cons**

- Still duplicates AX Code search.
- Requires another traversal/ranking/gitignore implementation in Node or a bundled native module.
- Makes Electron maintain a search engine that web/VS Code cannot share.
- Does not solve code index ownership.

**Decision:** Deferred. Only reconsider after AX Code search is the single source of truth and measured server-side latency still fails product targets.

### C. Use `rg`, `fd`, or `git ls-files` Subprocesses from Desktop

**Pros**

- Mature tools are fast and familiar.
- `git ls-files` can cheaply list tracked files.

**Cons**

- Adds binary availability and PATH concerns.
- Still pays subprocess overhead.
- Untracked, ignored, hidden, and non-git cases become complicated.
- Output parsing and cross-platform behavior increase maintenance cost.

**Decision:** Rejected for normal app search.

### D. Keep Current Architecture and Add Cache

**Pros**

- Lowest implementation cost.
- May improve repeated queries.

**Cons**

- Does not fix cold search.
- Does not remove failed Electron IPC.
- Does not remove duplicate full-tree scans.
- Cache invalidation is hard in active repos.

**Decision:** Rejected as insufficient.

### E. Delegate Search/Index to AX Code and Bound Desktop FS Work

**Pros**

- Single source of truth.
- Aligns with SDK/server architecture.
- Works across Electron, web, and VS Code.
- Removes duplicate desktop search/index work.
- Makes remaining bottlenecks measurable.
- Keeps local file browser capabilities where they belong.

**Cons**

- Search depends on AX Code readiness.
- AX Code search performance becomes more visible.
- Some offline local search behavior may need a separate explicit fallback.

**Decision:** Accepted as the best practice direction.

---

## Consequences

### Positive

- Electron avoids unsupported `desktop_search_files` IPC calls.
- Normal search behavior becomes consistent across runtimes.
- Desktop no longer competes with AX Code indexing by deep-scanning the same repo for normal search.
- Future performance work can focus on one search/index implementation.
- Project architecture matches the stated role of AX Code Desktop as a UI runtime.

### Negative

- Existing Tauri performance work becomes legacy-only unless separately ported.
- Users may see AX Code search warmup latency more clearly.
- Bounded project icon discovery may find fewer uncommon favicon locations.
- Files view may detect external changes less aggressively if polling is reduced.

### Neutral / Follow-Up

- Local directory listing remains in desktop/web server code.
- Project icon discovery remains local but should use bounded lookup first.
- Deep scan can remain as an explicit user-triggered fallback if needed.

---

## Implementation Guidance

1. Change the native search guard so Electron does not call `desktop_search_files`.
2. Keep `useFileSearchStore` as the UI-level cache and in-flight coalescer.
3. Keep normal file search routed through AX Code `find.files`.
4. Replace project icon broad search with fixed candidate path lookup.
5. Reduce Files view refresh fan-out.
6. Add debug-only search timing to separate UI overhead from AX Code latency.

---

## Validation

- `bun run type-check`
- `bun run lint`
- `bun run test`
- Focused tests for `useFileSearchStore` Electron behavior.
- Focused tests for bounded project icon discovery.
- Manual Electron check verifying no failed `desktop_search_files` IPC during file mention and command palette search.

---

## Revisit Criteria

Revisit this ADR only if all are true:

1. AX Code `find.files` is the only normal file search path.
2. Desktop duplicate scans and failed native probes have been removed.
3. Instrumentation shows AX Code search itself misses product latency targets.
4. A proposed desktop-native path can share ranking and ignore semantics with AX Code or is explicitly scoped to offline local browsing.
