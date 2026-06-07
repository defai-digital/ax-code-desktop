# PRD: Desktop Search and Index Consolidation

**Status:** Draft
**Author:** Engineering
**Date:** 2026-06-06
**Related:** [Tech Spec](../tech-spec/tech-spec-desktop-search-index-consolidation.md), [ADR-008](../adr/ADR-008-search-index-ownership.md)

---

## Problem

AX Code Desktop feels slow in large repositories because the desktop app performs extra filesystem work while the AX Code server is already responsible for search and code indexing.

The current app has several overlapping paths:

- `ax-code` owns `find.files`, text/symbol search, and `code.index.*` events.
- The UI file mention, Files view search, command palette file search, and sidebar search call `axCodeClient.searchFiles()`.
- The shared UI tries a desktop-native search path before falling back to AX Code.
- Legacy Tauri implements `desktop_search_files`, but the forward Electron shell does not.
- The web server still has a hand-written filesystem search runtime used by project icon discovery.
- Files view periodically refreshes expanded directories, which can compete with AX Code indexing and search.

The user-visible result is avoidable latency, background IO, and inconsistent architecture: the desktop shell duplicates work that should be handled by the AX Code server.

---

## Goals

1. Make file search feel responsive in large repositories by reducing duplicate scans and failed fallback paths.
2. Establish a clear ownership model:
   - AX Code server owns indexed/searchable project knowledge.
   - Desktop owns OS integration and shallow local filesystem operations.
3. Align implementation with the Electron forward path.
4. Keep web and VS Code-compatible fallback behavior intact.
5. Preserve useful file browser features without turning the desktop app into another indexer.

---

## Non-Goals

- Do not build a new desktop-side semantic index.
- Do not migrate search/indexing back into legacy Tauri.
- Do not rewrite AX Code server indexing.
- Do not replace the Express server.
- Do not remove Files view, file mention, or project icon support.
- Do not add new dependencies unless a later implementation review proves one is necessary.

---

## Users and Use Cases

### Large Monorepo Developer

Needs `@file` mention, sidebar search, and command palette file search to return quickly while AX Code may also be indexing or processing an agent task.

### Desktop User

Expects the Electron app to be the supported desktop path. Performance fixes should not depend on the legacy Tauri shell.

### Web / Remote User

Needs the same UI to keep working through HTTP/SSE without desktop-only IPC assumptions.

---

## Current Pros and Cons

### Keeping Desktop-Side Native Search

**Pros**

- Can be fast when implemented correctly in the active shell.
- Can bypass localhost HTTP overhead.
- Can serve file browsing even when AX Code is unavailable.

**Cons**

- Duplicates AX Code's search/index responsibility.
- Creates multiple ranking and ignore-rule implementations.
- Current optimization landed in legacy Tauri, not forward Electron.
- Electron currently pays a failed IPC attempt before falling back.
- More code paths make correctness and performance harder to verify.

### Delegating Search to AX Code

**Pros**

- Single source of truth for project search and indexing.
- Reuses existing `find.files` and `code.index.*` server behavior.
- Avoids maintaining separate gitignore, ranking, and traversal logic.
- Matches product architecture: UI runtime talks to AX Code via SDK.
- Works across Electron, web, and VS Code surfaces.

**Cons**

- Requires AX Code readiness for project search.
- Local shallow browse still needs separate filesystem APIs.
- If AX Code search is slow, the UI depends on server-side fixes.

### Keeping Shallow Local Directory Listing

**Pros**

- Needed for Files view, open/save-like workflows, project selection, and OS file operations.
- Can work before AX Code indexing is warm.
- Scope is bounded to visible/expanded directories.

**Cons**

- Polling or refreshing too many expanded dirs can still cause IO churn.
- Gitignore filtering via `git check-ignore` can spawn subprocesses.
- Must be carefully throttled and cached.

---

## Best-Practice Direction

Search and index ownership should be consolidated:

1. **AX Code owns project search and code intelligence.** File, text, symbol, semantic, and code graph features should route through AX Code APIs.
2. **Desktop owns shell capabilities only.** Electron IPC should cover OS integration, launch/update, local reveal/open, shallow directory list, and direct file read/write where needed.
3. **No hidden fallback tax.** Do not probe native desktop commands on every search unless the active shell has registered that command.
4. **Bound local filesystem work.** Local directory APIs should only inspect currently visible or explicitly requested directories.
5. **Prefer event-driven refresh over polling.** Where polling remains, it should be visible-scope-only, throttled, and easy to disable.
6. **Keep fallback paths explicit.** Web and remote use HTTP. Electron uses AX Code SDK for search and Electron IPC only for desktop shell operations.

---

## Requirements

### Functional Requirements

- File mention search, sidebar file search, Files view search, and command palette file search use AX Code `find.files` by default.
- Electron must not invoke `desktop_search_files` unless Electron main registers it.
- Project icon discovery must not deep-scan entire repositories by default.
- Files view directory refresh must be bounded to visible or user-requested directories.
- Empty search results must remain distinguishable from search failure.
- Web and VS Code-compatible builds retain HTTP fallback behavior.

### Non-Functional Requirements

- No duplicate full-repository traversal for a single user search.
- No failed IPC call per search in Electron.
- Search p95 should be measured separately for:
  - AX Code `find.files`
  - UI store/cache overhead
  - local directory refresh
- Directory refresh must avoid unbounded fan-out across expanded paths.
- Changes must preserve light/dark UI behavior and existing file browser UX.

---

## Success Metrics

| Metric | Target |
|---|---|
| Electron failed `desktop_search_files` IPC calls per search | 0 |
| Desktop-side full repository search paths | 0 for normal file search |
| Project icon discovery repository walk | 0 by default; bounded fallback only |
| Files view refresh fan-out | visible or explicitly requested directories only |
| File search p95 in a 50k-file repo | Defined by AX Code `find.files`; UI overhead adds <= 25ms |
| User-visible search failure handling | Shows failure distinctly from empty results |

---

## Risks

- AX Code `find.files` may expose server-side bottlenecks after desktop duplicate work is removed.
- Removing desktop-native search could regress offline browsing expectations if users relied on search before AX Code readiness.
- Project icon discovery may find fewer favicons if deep scan is replaced with bounded lookup.
- Files view refresh changes may delay detection of external file changes.

---

## Rollout

1. Remove Electron's failed native search probe.
2. Convert normal file search surfaces to AX Code-only search.
3. Bound project icon discovery.
4. Reduce Files view refresh fan-out.
5. Add lightweight instrumentation to separate AX Code search time from UI/cache/local directory refresh time.
6. Revisit server-side AX Code search performance only after duplicate desktop work is eliminated.
