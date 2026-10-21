## Review — Mission Control bulk selection + palette ranking (request_changes, review `859d633c0ac27eef`)

**Verification:** `pnpm --dir desktop/packages/ui run type-check` passed (`5c64ce7bc32ca2ec`); focused suites `MissionControl.bulk` / `navigation` / `grouped` / `MissionControlRow` / `paletteRanking` passed (`763f3fffb0545e22`). Both findings were registered as structured artifacts; the override from "approve" is because the two MEDIUM items are behavioural paths the focused tests do not exercise, not because of build breakage. No files were modified (read-only review).

### By severity

**1. Bulk stop can silently skip an approved running session — MEDIUM** · `MissionControl.tsx:430`
Targets are frozen from `bulkRows` (`:406`), then re-gated per target on `useSupervisionStore.getState().rows`. Those are different sources: an SSE refresh that transiently drops a root (or a scope/archived change mid-run) yields `state !== "running"` → `skipped`, and the toast reports "No longer running" for a session the user approved. Use one predicate for both the count and the gate.

**2. `aria-selected` no longer means keyboard focus — MEDIUM** · `MissionControlRow.tsx:102`
Changed from `selected` to `bulkSelected`. On a `role="grid"` with `aria-activedescendant`, assistive tech and `desktopUiWebMcp.ts:104` now describe a different row than j/k/Enter acts on. Keep it tied to keyboard selection; the native checkbox already announces membership.

**3. Pruning compares size, not membership — LOW** · `MissionControl.tsx:126-132`
`next.size === current.size ? current : next` keeps a stale set when the id set changes with equal cardinality. Compare membership instead.

**4. Collapsed group header advertises a "select" that deselects — LOW** · `MissionControlGroupHeader.tsx:30`
`checked` requires `!collapsed`, so a collapsed all-selected group renders plain unchecked while its rows stay selected; the next click takes the `allSelected` branch and clears. Render mixed for hidden selected rows.

**5. Stop outcome inferred from `sessionAbortFlags` — LOW** · `MissionControl.tsx:434-437`
The marker is long-lived and also deleted by `session-ui-store.ts:822-845`, so a successful abort can be counted as failure with no error surfaced. Return success from `abortCurrentOperation` or re-read the row.

**6. Escape capture ignores editable targets; focus restore is conditional — LOW** · `MissionControl.tsx:512-528`
Unlike `handleKeyDown:240`, the capture clears selection on any Escape inside the board. Typing Escape in the peek's new-set input would clear the selection and `stopPropagation`, defeating the input's cancel. `:525` restores focus only inside `role="toolbar"`, so clearing from the group header leaves focus there.

**Info:** `aria-checked` set on a native checkbox (`MissionControlGroupHeader.tsx:51`); `role="status"` reused by a bar that unmounts on clear (`MissionControlBulkBar.tsx:48`, `MissionControl.tsx:661`).

### Palette part
`paletteRanking.ts` is correct for root sessions: board rows keep urgency order, archived/child sessions fall back to recency (`:24-27`), and `paletteHasNeedsYou` correctly gates `groupOrder` (`CommandPalette.tsx:650-662`). Caveat: `supervisionRows` contains only roots, so child sessions shown in the palette get no badge or project label (`:768-784`) — "ranked like Mission Control" holds only for roots.