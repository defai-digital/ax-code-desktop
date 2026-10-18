# Glm implementation review

Date: 2026-10-18
Runner: AX Code, read-only, write/shell/task tools denied.
Terminal status: completed, process exit 0.
Input: scoped TS/CSS diff before follow-up fixes; locale and documentation files were excluded.
These are reviewer leads; see the implementation report for verified dispositions.

## AX Code Desktop UI/UX Diff Review

### HIGH — Board keyboard handler hijacks the new density `<select>`
`desktop/packages/ui/src/components/supervision/MissionControl.tsx:~157` — the guard added for `summary` is `target.closest("button, a[href], summary")`, but this diff adds a native `<select>` (and it sits inside `MissionControlHeader`, so its keydown bubbles to the board's `onKeyDown`). With focus in the select, `Space`/`Enter`/`j`/`k` match `isBoardShortcut` and are treated as board navigation (the handler presumably `preventDefault`s), so the select cannot be opened with Space/Enter, and `j`/`k` move the row selection while the user is in the select. If the unchanged handler also binds arrow keys, the select becomes fully keyboard-inoperable — an accessibility regression introduced by this diff.
**Fix:** add form controls to the exemption: `target.closest('button, a[href], summary, select, input, textarea, [contenteditable="true"]')`.

### HIGH (conditional) — New i18n keys have no corresponding locale changes in this diff
Keys referenced but not added anywhere in the diff: `supervision.inspector.tools/showLabels/hideLabels`, `supervision.request.scopeCount`, `supervision.missionControl.density/comfortable/compact/filterLabel`, `supervision.navigation.workspace`, `header.navigation.mainAria` (InspectorRail.tsx, RequestActionCard.tsx, MissionControlHeader.tsx, WorkspaceNavigation.tsx). If they were not added in an excluded file, users see raw keys — and every new test mocks `t`, so the suite cannot catch it. **Fix:** confirm `en` (plus other locales) contains all ten keys; add a non-mocked smoke test or i18n key-completeness check.

### MEDIUM — Collapsed inspector toggle renders text in a 40px rail
`InspectorRail.tsx` toggle button renders `{t("supervision.inspector.tools")}` as visible text when collapsed, in a `w-full` button inside a 3.25rem rail with no truncation. "Tools" barely fits; longer locale strings (e.g., German "Werkzeuge") will wrap or overflow. It's also the only text-only control in an icon rail. **Fix:** when collapsed, show an icon (chevron-left/panel icon) with the label as `sr-only`, keeping the existing `aria-label`/`title`.

### MEDIUM — Mobile loses its only Mission Control entry point
`Header.tsx` removes the board toggle button; `MainLayout.tsx:478` renders `<WorkspaceNavigation />` only when `!isMobile`. NeedsYouButton and the notification center remain, but on mobile there is no labeled way to open/close the board (the keyboard shortcut is desktop-only). If the mobile exclusion is intentional, it should be stated; otherwise render the nav (or a compact board button) on mobile too.

### LOW — Disclosure can be a visual no-op
`RequestActionCard.tsx:~77` — `needsExpansion` fires when `patterns.join(" · ").length > 160` even with ≤2 short-ish patterns; collapsed and expanded then render identical content, so the button toggles `aria-expanded` with no visible change. Prefer a per-pattern or visible-content trigger, or always truncate collapsed previews so expanding always reveals more.

### LOW — Verify role/icon contract assumptions
1. `MissionControlRow.tsx` now emits `role="gridcell"` six times — valid only if each row's parent chain is `role="row"` inside a `role="grid"` container (the board's `aria-activedescendant` implies grid, but confirm the actual board role; otherwise gridcell is invalid ARIA).
2. `SupervisionStateBadge.tsx` introduces icons `loader` and `time` for running/idle (previously dot-only). Confirm both are in the `IconName` union — TypeScript will catch this, but no typecheck evidence is in the diff.
3. `WorkspaceNavigation.tsx` — the Workspace button calls `closeBesideChat("diff")` without an explicit guard check in tests (only the Review/open path is guard-tested). Confirm `closeBesideChat` honors `mainTabGuard` so an unsaved editor is not silently discarded. Also, `useSupervisionStore.setState({...})` bypasses `toggleMissionControl`; confirm that action has no side effects (analytics/history) being skipped.

### INFO — Minor
- Expanded rail buttons: the absolute badge (`-top-0.5 -right-0.5`) now overlaps the label text start area; acceptable but check visually at 99+.
- `MissionControlHeader` filter buttons: `role="group"` + `aria-pressed` is legal; a `radiogroup`/`aria-checked` pattern would express single-select more precisely. Not a defect.
- Narrow (default) mission-row grid places `age` in an `auto` column without right-alignment until 44rem — cosmetic only.

### Verified correct (source + test backed)
- `RequestActionCard`: the `respondingRef` guard fixes same-tick double-submit (old `busy` closure), and re-setting `mountedRef.current = true` in the effect body fixes StrictMode's stuck-`busy` after simulated remount — both covered by `RequestActionCard.test.tsx`, including failure recovery and payload contracts (`"once"`/`"reject"`, `[["Blue"]]`) unchanged.
- Full scope disclosure: blank patterns filtered, per-pattern truncation with verbatim reveal on expand, disclosure reset keyed by `sessionId:kind:request.id` — tested.
- `useSupervisionStore`: density/labels persisted, malformed storage validated (`"compact"` only, boolean-only labels), and the store test proves unrelated working-set writes don't clobber display prefs or board focus.
- `SessionNodeItem`: `motion-safe:animate-busy-pulse` respects reduced motion; review-state colors unified via `SUPERVISION_PRESENTATION`.
- MainLayout restructure preserves split-pane, terminal dock, mobile back-to-chat, and `ContextPanel` semantics; the narrow-container rail overlay is correctly anchored (`workspace-body` is `relative` and the container element).

**Priority order:** fix the select keyboard exemption first, then confirm i18n keys exist, then the collapsed-rail toggle and mobile board entry.
