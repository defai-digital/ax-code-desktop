# Tech Spec: Desktop Search and Index Consolidation

**Status:** Draft
**Author:** Engineering
**Date:** 2026-06-06
**Related:** [PRD](../prd/prd-desktop-search-index-consolidation.md), [ADR-008](../adr/ADR-008-search-index-ownership.md)

---

## Summary

This spec consolidates search and index ownership around AX Code server APIs and removes desktop-side duplicate search work from the normal Electron path.

The implementation is intentionally narrow:

- Do not add a new Electron-native indexer.
- Do not extend legacy Tauri search as the forward path.
- Keep shallow directory browsing local.
- Delegate normal project search to `axCodeClient.searchFiles()` / AX Code `find.files`.
- Bound remaining local filesystem scans.

---

## Current Architecture

### Normal File Search Surfaces

Call sites:

- `packages/ui/src/components/chat/FileMentionAutocomplete.tsx`
- `packages/ui/src/components/layout/SidebarFilesTree.tsx`
- `packages/ui/src/components/views/FilesView.tsx`
- `packages/ui/src/components/ui/CommandPalette.tsx`

These converge through:

- `packages/ui/src/stores/useFileSearchStore.ts`
- `packages/ui/src/lib/ax-code/client.ts` `searchFiles()`
- vendored AX Code SDK `find.files`

### Native Search Probe

`useFileSearchStore.ts` currently tries:

```ts
type === 'file' && isTauriShell()
  ? searchFilesNative(...).then(native => native ?? axCodeClient.searchFiles(...))
  : axCodeClient.searchFiles(...)
```

In Electron, `isTauriShell()` is true because `packages/electron/src/preload.js` exposes a Tauri-compatible `window.__TAURI__.core.invoke` bridge. However, `packages/electron/src/main.js` does not register `desktop_search_files`. Each Electron search therefore pays a failed IPC attempt before falling back to AX Code.

### Local Filesystem Search Runtime

`packages/web/server/lib/fs/search.js` implements BFS directory traversal and fuzzy scoring. It may spawn `git check-ignore` when respecting gitignore. It is not the main `find.files` path, but it is used by project icon discovery:

- `packages/web/server/lib/ax-code/project-icon-routes.js`

Current project icon discovery performs a broad search for `favicon` with `includeHidden: true` and `respectGitignore: false`.

### Files View Refresh

`packages/ui/src/components/views/FilesView.tsx` refreshes expanded directories:

- on visibility return
- every 8 seconds while visible

Each refresh can call local directory listing and gitignore checks. This is useful for a file browser, but it can fan out across many expanded directories.

---

## Proposed Architecture

### Ownership Boundary

| Capability | Owner |
|---|---|
| File search by query | AX Code server |
| Text search | AX Code server |
| Symbol/code graph/semantic index | AX Code server |
| `code.index.*` lifecycle | AX Code server |
| File mention results | UI over AX Code SDK |
| Command palette file results | UI over AX Code SDK |
| Shallow directory listing | Desktop/web server local FS API |
| File read/write/reveal/open | Desktop/web server shell/FS API |
| Project icon discovery | Bounded local lookup with optional explicit deep scan |

---

## Implementation Plan

### Phase 1: Remove Failed Electron Native Search Probe

File: `packages/ui/src/stores/useFileSearchStore.ts`

Add an explicit capability check before using `searchFilesNative`.

Preferred minimal approach:

- Replace `isTauriShell()` guard with a capability that excludes Electron unless Electron main registers the command.
- For current Electron, file search should directly call `axCodeClient.searchFiles()`.

Candidate helper:

```ts
const canUseNativeFileSearch = (): boolean => {
  return isTauriShell() && !isElectronShell();
};
```

Longer-term helper if Electron later adds the command:

```ts
const canUseDesktopCommand = (name: string): boolean => {
  return window.__OPENCHAMBER_ELECTRON__?.commands?.includes(name) === true
    || (isTauriShell() && !isElectronShell());
};
```

Acceptance:

- Electron file search performs no `desktop_search_files` IPC call.
- File mention still returns AX Code `find.files` results.
- Existing Tauri behavior is unchanged until legacy support is removed.

Tests:

- `useFileSearchStore.test.ts`: Electron runtime with Tauri shim should call `axCodeClient.searchFiles()` directly.
- Existing cache/in-flight tests continue to pass.

---

### Phase 2: Consolidate Normal Search Surfaces on AX Code

Files:

- `packages/ui/src/components/chat/FileMentionAutocomplete.tsx`
- `packages/ui/src/components/layout/SidebarFilesTree.tsx`
- `packages/ui/src/components/views/FilesView.tsx`
- `packages/ui/src/components/ui/CommandPalette.tsx`
- `packages/ui/src/stores/useFileSearchStore.ts`

No broad UI rewrite is required. Keep these surfaces using `useFileSearchStore.searchFiles()`, but make the store's default path AX Code search.

Rules:

- `type: 'file'`: AX Code `find.files`.
- `type: 'directory'`: keep existing AX Code `find.files` with `type: 'directory'` if supported; otherwise use a bounded local fallback only for explicit directory lookup.
- Empty query should not trigger full-repo file search.
- Directory search should not run automatically in file mention unless the query shape requires it or the UI is explicitly showing directories.

Possible optimization:

- In `FileMentionAutocomplete`, delay directory search until after file results complete or only run it when the query includes `/`.
- Keep recent open files local and immediate.

Acceptance:

- `@foo` does not trigger more than one file search request and one optional directory request.
- Empty query shows recent files/agents only and does not search the repo.

---

### Phase 3: Bound Project Icon Discovery

File: `packages/web/server/lib/ax-code/project-icon-routes.js`

Replace broad `searchFilesystemFiles(project.path, { query: 'favicon', limit: 200, includeHidden: true, respectGitignore: false })` with a bounded lookup.

Preferred lookup order:

1. `favicon.ico`
2. `favicon.png`
3. `favicon.svg`
4. `public/favicon.ico`
5. `public/favicon.png`
6. `public/favicon.svg`
7. `app/favicon.ico`
8. `app/favicon.png`
9. `app/favicon.svg`
10. `src/favicon.ico`
11. `src/favicon.png`
12. `src/favicon.svg`

Optional explicit fallback:

- If `forceDeepScan === true`, allow a bounded deep scan with max directories and timeout.
- Do not deep scan by default.

Acceptance:

- Default icon discovery performs at most a fixed number of stat/read attempts.
- Existing upload/delete behavior remains unchanged.
- No full repository walk on project list render or default discovery.

Tests:

- Add route/runtime test proving bounded lookup finds `public/favicon.png`.
- Add test proving no `fsSearchRuntime.searchFilesystemFiles` call on default discovery.
- Add test for no favicon found.

---

### Phase 4: Reduce Files View Refresh Fan-Out

File: `packages/ui/src/components/views/FilesView.tsx`

Current behavior refreshes all expanded directories on visibility return and every 8 seconds.

Change policy:

- Refresh root plus visible expanded directories only.
- Cap refresh batch concurrency.
- Skip refresh when no Files view tab is active.
- Keep manual refresh button for full root refresh.
- Consider increasing periodic interval from 8 seconds to 30 seconds or replacing it with focus/manual refresh only.

Implementation options:

1. Track visible tree rows and refresh only directories represented in the current viewport.
2. If virtualization data is not available, cap to the first N expanded directories by depth and recency.
3. Add a dirty marker and refresh a directory only after file operations in or below it.

Recommended MVP:

- On visibility return: refresh root and selected file parent.
- Periodic refresh: selected file parent only, not all expanded dirs.
- Manual refresh: current root.

Acceptance:

- With 100 expanded directories, background polling does not issue 100 list calls every interval.
- Manual refresh still updates the tree.
- CRUD operations still refresh affected parent directories.

---

### Phase 5: Add Lightweight Instrumentation

Add optional debug timing around search and directory refresh.

Targets:

- `useFileSearchStore.searchFiles()`
- `axCodeClient.searchFiles()`
- Files view `loadDirectory()` / `refreshDirectory()`
- project icon discovery

Requirements:

- Instrumentation must be gated by existing debug settings or an env/localStorage flag.
- Do not log full user paths unless debug mode is explicitly enabled.
- Record duration, result count, and source path (`ax-code`, `native`, `local-list`, `icon-bounded`, `icon-deep-scan`).

Acceptance:

- A developer can distinguish AX Code search latency from UI cache overhead.
- Logs do not appear by default.

---

## Compatibility

### Electron

Default search route is AX Code SDK. Electron IPC remains for desktop shell operations.

### Legacy Tauri

The existing `desktop_search_files` can remain for maintenance, but new work should not depend on it.

### Web / Remote

Continues to use the web server and AX Code SDK. No desktop IPC dependency.

### VS Code Extension

No change expected as long as search continues through AX Code APIs.

---

## Validation

Required commands from repo root:

```bash
bun run type-check
bun run lint
bun run test
```

Focused tests to add or update:

```bash
bun test packages/ui/src/stores/useFileSearchStore.test.ts
bun test packages/web/server/lib/ax-code/project-icon-routes.test.js
```

Manual checks:

| Scenario | Expected Result |
|---|---|
| Electron: type `@index` in chat | AX Code results appear; no failed `desktop_search_files` IPC |
| Electron: command palette file search | Uses AX Code search; no native probe |
| Files view with many expanded dirs | Periodic refresh is bounded |
| Project icon discovery | Finds common favicon paths without deep scan |
| AX Code temporarily unavailable | Search failure is visible and distinct from empty results |

---

## Migration Notes

- ADR-004 and the Rust file search docs describe a legacy Tauri optimization direction. This spec supersedes that direction for forward desktop work.
- Do not delete legacy documents yet; they remain useful as historical context.
- If a future Electron-native fast path is needed, it must be justified with measurement after AX Code search is the single source of truth.

---

## Open Questions

1. Does AX Code `find.files` fully support directory-only results across all runtime modes?
2. Should project icon discovery expose an explicit "deep scan" button for users who want best-effort discovery?
3. Should Files view polling be user-configurable or removed entirely in favor of focus/manual refresh?
4. Should AX Code expose a project search readiness signal so the UI can present warming state instead of generic loading?
