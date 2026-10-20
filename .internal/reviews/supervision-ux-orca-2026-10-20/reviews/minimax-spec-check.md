# Adversarial Spec Check — Read-only Findings

Citations are `path:line`. Ranked by severity.

## Critical / High — will break tests or ship broken UX

**H1. MissionControl.navigation.test breaks when `<select>` is removed.**
`MissionControl.navigation.test.tsx:139` queries `container.querySelector("select")!` (the density), `:150-158` dispatches ` "/", "j", "k", " "` on it, and `:160-165` sends `Escape` to it. The spec replaces the density `<select>` with two aria-pressed buttons (`MissionControlHeader.tsx:145-153`). These three test bodies must be rewritten (button queries + neutral key assertions) or the suite blocks the PR. The engineer's owned-tests list explicitly includes `components/supervision/MissionControl.*.test.tsx`, so this is in scope to fix.

**H2. `MissionControlRow.test.tsx:78-79` will fail after the row redesign.**
Line 78 asserts `[role="gridcell"]` count `=== 6`; line 79 asserts the row `textContent` contains `row.projectLabel`. After the redesign the row collapses `state|project|evidence|age|meta` into 4 gridcells and, per spec, hides projectLabel when grouped (the new default `boardGroupBy: "project"`, see `useSupervisionStore.ts:69-76`). Engineer must pass a `showProjectMeta` (default `true`) and either preserve 6 gridcells or update the count + add a `showProjectMeta=false` test.

**H3. Keyboard nav in `MissionControl.tsx:229-256` still walks `filtered`, not visual order.**
Spec requires j/k/arrows/Enter/Space to follow flattened groups; the implementation must use `useVisibleRows(filtered, collapsedGroups)` for both `selectedIndex` and the fallback `useEffect` (`:127-131`) so a collapsed group doesn't auto-select into a hidden row. Required new test ("j moves into next group when urgency order differs") is missing.

**H4. `MissionControl.tsx:135` `document.getElementById(\`mission-row-${id}\`).scrollIntoView` breaks for collapsed rows.**
Rows hidden by collapse have no DOM node; the call silently no-ops and `aria-activedescendant` decouples from the visible row. Maintain a ref-backed map or skip the scroll when the row isn't rendered.

**H5. MissionControlGroupHeader must not be `.mission-control-row`.**
Spec calls this out, and the e2e `supervision-workspace-webmcp.mjs:70,99,104` counts `.mission-control-row` to confirm 2 session rows. But the new header chevron is a `<button>`, so `audit.all()` (`settings-webmcp.mjs:51`) will now see `Collapse <project>` / `Expand <project>` buttons. Ensure their `aria-label` strings cannot collide with `Open`/`Details` prefixes the e2e filters on (`:73` uses `startsWith`); pick distinct prefixes (`"Collapse"`, `"Expand"`).

**H6. `DiffView.tsx:1819` single-mode layout doesn't have room for the new rail.**
Today single-mode is `<div className="flex flex-1 min-h-0 overflow-hidden px-3 py-3 relative">` containing only `renderSelectedDiffViewer()` (`:1784-1814`). Spec demands the rail in BOTH modes when `paneWidth >= 640`. The single-mode wrapper needs flex split (rail aside diff). Otherwise `data-review-width` (`:1819`) is unchanged but the rail can't be mounted without CSS surgery.

**H7. `DiffView` `hideStackedFileSidebar` only honored in stacked branch.**
`:1001,1693,1694` — the existing FileList only renders in stacked mode *and* behind `hidden lg:flex`. Spec replaces with ReviewFileRail at paneWidth ≥ 640 regardless of mode (drop the `hidden lg:flex`); at 800px window (e2e width) the rail must appear in single mode too.

**H8. `DiffCommentSummaryBar` becomes always-on.**
`:27` returns `null` when `draftCount === 0`; spec requires a slim persistent hint. Always rendering adds sticky-bottom height; verify it doesn't push `data-split-chat` `<800px` collapse (`supervision-workspace-webmcp.mjs:152`) off-screen and that `getComputedStyle([data-split-chat]).display === 'none'` still holds at 600px.

**H9. `Cmd/Ctrl+Enter` shortcut must skip textareas/inputs but `DiffView` has no top-level keydown.**
Existing keyboard work lives in component effects (`:1008-1101,1301-1429`). Spec sends when focus is inside the review pane and not editable; must use a pane-scoped `onKeyDown` and gate on `target.closest("textarea,input")` (compare MissionControl `:195-196`).

## Medium

**M1. Directory text loses raw path.** `DiffView.tsx:1822` currently renders `{effectiveDirectory}`; `data-review-directory={effectiveDirectory}` (`:1821`) must keep the full path while text becomes `formatPathForDisplay(path, homeDirectory)` + `title={effectiveDirectory}`. Verify path-substring filter `supervision-workspace-webmcp.mjs:77` still equals the attribute (not the text).

**M2. `useReviewProgressStore` signature uses `descriptor.code` (e.g. `"M"`).** `diffView.tsx:312` shows `code` from `describeGitChange`, not the raw two-letter status. If a file flips `M → MM` (staged then edited), `M` matches stored sig — does it actually un-view? State code letter alone won't distinguish. Engineer must include the full `index+working_dir` codes per `DiffView.tsx:96-109`.

**M3. Reading-set `<select>` at 600px.** `MissionControlPeek.tsx:144-157` uses a native `<select>` (no `normal-case`); button lowercase is fine here (out of scope) but the e2e expects this `select` to render — preserve.

**M4. Shortcut `<kbd>` chip split.** `shortcuts.ts:545` returns `"⌘ + ⇧ + H"`. Splitting `" + "` yields three tokens; spec is ambiguous on whether `+` is a chip too — pick one and keep the `title=` attribute (`MissionControlHeader.tsx:132`) as the raw string.

**L1. Persistence:** `useSupervisionStore.ts:69-114` mirrors `density` into `PersistedSupervision`; `boardGroupBy` must follow the same pattern (default + read/write/restore) and the `isStringArray`/`workingSets` filter on `:78-103` should not skip it.

**L2. `pruneLastViewed`** (`useSupervisionStore.ts:135`) is only used for `lastViewedAt`; a `viewed` Map needs its own cap or size guard, otherwise signature churn can grow unbounded.

## Notes for verifier (no edits)

- E2E row count (`.mission-control-row`) deliberately excludes `MissionControlGroupHeader` — confirm both. Existing `popout.test.tsx` and `navigation.test.tsx` mock `@/hooks/useSupervisionRows` and render `MissionControl` directly, so the keyboard fallback must keep working without an actual sync provider.
- `useGitBranchLabel` (`useGitStore.ts:1041-1046`) is shared with `MiniChatLayout`/`Header`; adding it to `MissionControlRow` adds per-directory subscriptions per row — re-evaluate perf for ≥20 rows.

Cited files only; no edits made.