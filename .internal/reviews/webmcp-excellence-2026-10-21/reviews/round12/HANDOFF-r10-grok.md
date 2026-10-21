# R10 handoff: review rail tree and adjustable width

Branch `r11-rail-tree`. No commit.

The flat review rail now groups files into a collapsible directory tree, with a remembered Tree / List toggle and a rail width the viewer can drag or resize from the keyboard.

## New English strings

Added only in `desktop/packages/ui/src/lib/i18n/messages/en.ts`. Other locale files were left unchanged.

| Key | English text |
| --- | --- |
| `diffView.rail.viewMode` | File list layout |
| `diffView.rail.viewTree` | Tree |
| `diffView.rail.viewList` | List |
| `diffView.rail.resize` | Resize the file list |
| `diffView.rail.directorySummary` | {name}, {viewed} of {total} viewed |

Directory rows also reuse `diffView.rail.viewedProgress` (`{viewed} of {total} viewed`) for the visible count.

## What changed

- `desktop/packages/ui/src/components/views/reviewFileRailTree.ts` (new). Groups paths into a tree, compresses a chain of single-child directories into one node (`a/b/c`), and keeps depth-first visual order by first appearance. `/` and `\\` are both separators. Directory ids use `/`. The original path is what `onSelectFile` and `onOpenFile` receive. `orderReviewRailFiles` returns that visual order in tree mode and the caller's order in list mode, including files inside collapsed directories. Width clamp is 180px through half the measured pane (`max(180, floor(paneWidth * 0.5))`); an unmeasured pane does not cap a remembered width. Default width is 240px. Keyboard step is 16px. Collapse state is an in-memory set keyed by directory, scope, and node id (NUL-separated). It is not written to storage and it does not store file contents. Mode (`ax-code-review-rail-mode`) and width (`ax-code-review-rail-width`) are per-viewer local preferences, with `try/catch` around storage.
- `desktop/packages/ui/src/components/views/ReviewFileRail.tsx`. Tree mode renders `role="tree"` / `role="treeitem"` with `aria-expanded`, `aria-level`, Left/Right to collapse or expand, and Enter to select a file. A directory row shows its name, file count, and how many of those files are reviewed, using the same viewed marks as the file rows. Filtering forces matching directories open. List mode is a flat `role="list"`. The grouping is memoized on path equality, so a new array with the same paths does not rebuild. When the selected file changes into a collapsed directory, that directory opens. Collapsing the directory that already contains the selection stays collapsed. File rows keep `data-review-file` and `aria-current`. Directory rows do not carry `data-review-file`. The edge separator is focusable, `role="separator"`, with `aria-valuenow`, `aria-valuemin`, and `aria-valuemax`. Pointer drag resizes it. ArrowRight increases the width and ArrowLeft decreases it. A right-to-left direction flips only the pointer delta.
- `desktop/packages/ui/src/stores/useReviewProgressStore.ts`. `adjacentReviewFile` and the existing `]` / `[` / `v` pane keys follow `orderReviewRailFiles`. The store imports that pure helper and does not import another store.
- `desktop/packages/ui/src/components/views/DiffView.tsx`. Previous/next file buttons and hunk file order use the same visual order and update when the Tree / List mode changes.
- `desktop/packages/ui/src/styles/design-system.css`. Rail title row, mode buttons, directory rows, focus ring, and the resize handle. The rail width now comes from the inline style (minimum 180px) instead of the old `12rem` / `15rem` limits.
- Tests. `ReviewFileRail.test.tsx` covers grouping, chain compression, both separators, reviewed counts, mouse and keyboard collapse, per-directory and per-scope collapse, Enter to select, next/previous into a collapsed directory, flat mode and remembered layout, width clamping and keyboard/pointer resize, a blocked `localStorage` write, and a 2,000-file memoization check. `BranchChangesView.test.tsx` and `SessionChangesView.test.tsx` query the current file row as `treeitem` because tree mode is the default. The existing `]` / `[` keys are the next/previous navigation this rail already used.

## Verification

`pnpm --dir desktop/packages/ui run type-check` — passed (`tsc --noEmit`, exit 0).

`pnpm run lint` — passed (electron, ui, and web eslint, exit 0).

`pnpm --dir desktop/packages/ui exec vitest run src/components/views` — 344 passed, 1 failed (345 tests; 47 files passed, 1 failed).

The failure is `src/components/views/SettingsView.models.test.tsx` > `translated Advanced group search finds the same destinations`. It calls `loadDictionary("zh-TW")`, and `loadDictionary` throws `Invalid language catalog` because the Traditional Chinese catalog has fewer keys than `en.ts`. `ReviewFileRail.test.tsx` alone passed, 18 tests.

`pnpm --dir desktop/packages/ui exec vitest run src/components/views/ReviewFileRail.test.tsx -t "next and previous reach a file inside a collapsed directory|clamps keyboard and pointer resizing"` after restoring both probes — 2 passed, 16 skipped, exit 0.

## Mutation probes

Both probes were restored. The source no longer contains the emptied bodies.

1. Next reaches a file in a collapsed directory. `revealReviewSelection` was emptied so a selection change no longer deleted collapse keys.

   Command: `pnpm --dir desktop/packages/ui exec vitest run src/components/views/ReviewFileRail.test.tsx -t "next and previous reach a file inside a collapsed directory"`

   Result: exit 1. `ReviewFileRail > next and previous reach a file inside a collapsed directory and expand it` failed at `ReviewFileRail.test.tsx:346`. `aria-expanded` stayed `"false"` (expected `"true"`). The `]` key had already selected `a/b/c/deep.ts`. Restored, then the same test passed.

2. Width clamp. `clampReviewRailWidth` returned the rounded width and skipped the 180px minimum and the half-pane maximum.

   Command: `pnpm --dir desktop/packages/ui exec vitest run src/components/views/ReviewFileRail.test.tsx -t "clamps keyboard and pointer resizing"`

   Result: exit 1. `ReviewFileRail > clamps keyboard and pointer resizing to 180 and half the pane` failed at `ReviewFileRail.test.tsx:397`. After ArrowRight from 390px on an 800px pane, `aria-valuenow` was `"406"` (expected `"400"`, half of 800). Restored, then the same test passed.

## Left open

- The other locale catalogs (`de`, `es`, `fr`, `id`, `it`, `ja`, `ko`, `pt-BR`, `ru`, `tr`, `vi`, `zh-CN`, `zh-TW`) do not contain the five new keys. They were not edited, per the task. `loadDictionary` rejects those catalogs until the keys exist, which is why the settings test above fails. `pnpm run check:locales` was not part of the requested commands and was not run; it will fail for the same mismatch.
- Native supervision journeys and a packaged desktop window were not run. The DOM tests keep `data-review-file` and `aria-current`, and directories start expanded, so the existing `[data-review-file]` queries still see every file until a directory is collapsed.
- No commit.

## Review fixes

Addresses every HIGH and MEDIUM finding in `REVIEW-R10.md`, plus the four LOW items. No new i18n keys. PageUp and PageDown on the resize separator were left out; the requested contract is arrows plus Home and End.

### One tab stop, and focus follows the tree keys

Tree mode uses a roving tabindex. The active treeitem is `tabIndex={0}`. Every other treeitem, and the select button, open button, and viewed checkbox inside a tree row, is `tabIndex={-1}`. List mode keeps the natural tab order of those controls. The tab stop follows the selected file without calling `focus()`, so `]` and `[` still bubble.

Up and Down move among visible stops and skip children of a collapsed directory. Home and End move to the first and last visible stop. At either end, those keys are still consumed.

The motion matches the WAI-ARIA treeview pattern:

- Right on a closed directory expands it and leaves focus on that directory. A second Right moves to the first child.
- Right on an open directory moves to the first child.
- Left on an open directory collapses it and leaves focus there.
- Left on a file or a closed directory moves to the parent. It does not collapse the parent.
- Enter on a file selects that file. Enter on a directory toggles it. Focus stays on the row that handled the key.

Focus is applied in a layout effect after the roving `tabIndex` updates. The effect runs only when a tree action asks for focus. The stop is found by walking `[data-review-tree-stop]`, because directory keys contain a colon (`dir:src`) and a `CSS.escape` attribute selector does not match them here.

### Collapsed directories keep their file rows

Directory children always render inside `role="group"`. A collapsed group keeps the class `review-file-rail__branch--collapsed` (`height: 0`, `overflow: hidden`, `pointer-events: none`). The rows are not `display: none`, do not use the `hidden` attribute, and are not `aria-hidden`, so `[data-review-file]` still matches and `getByRole` can still name the file. `aria-expanded` on the directory is `false` while it is collapsed. Keyboard stops do not include those clipped rows. This closes the selector gap noted under "Left open" above for a collapsed directory. Native supervision journeys and a packaged window were still not run.

### Resize Home and End, and file names

Home sets the width to 180. End sets it to the finite half-pane maximum. End does nothing when the pane is unmeasured and the maximum is infinite. ArrowLeft and ArrowRight still step by 16px, and the existing clamp still applies.

A file row's accessible name is the path, the existing status description, and `diffView.rail.viewedProgress` for that one file. An unviewed modified file reads `src/b.ts, Modified file, 0 of 1 viewed`. Marking it viewed changes the count to `1 of 1 viewed`.

### Valid tree structure

The `role="presentation"` wrapper is gone. Each directory is a `treeitem` whose children sit in a nested `role="group"`. A click that starts inside that group does not toggle the directory. The Tree / List switcher remains a `role="group"` outside the tree.

### Small cleanups

- Pointer drag listens on `window`. `pointerup`, `pointercancel`, and unmount each remove those listeners.
- `pruneReviewDirectoryCollapse` drops a collapse key when that directory id is no longer in the tree for the same directory and scope.
- The reveal effect depends on the ancestor ids joined with NUL, not on the ancestor array object. Rebuilding the tree for the same selection does not pop a collapsed directory back open.
- `localStorage` is not read when the module evaluates. The snapshot starts as the server snapshot (tree, 240). The first `subscribeReviewRail` hydrates storage, and only when nothing has already replaced that snapshot. `resetReviewRailForTests` points the snapshot back at the server snapshot and clears the hydrated flag.

### Tests

`ReviewFileRail.test.tsx` is 27 tests. The nine added for this pass:

- `uses one tab stop and moves focus with the tree keys`
- `keeps collapsed file rows mounted for selectors and assistive technology`
- `puts directory children in a group inside the treeitem`
- `file rows name the path, status, and viewed state`
- `resize drag drops its window listeners when the rail unmounts`
- `drops a collapse key when its directory id leaves the tree`
- `selection ancestor key follows the ids rather than the tree object`
- `rebuilding the tree keeps a collapsed directory closed for the same selection`
- `does not read review rail storage until a subscriber attaches`

The resize test also presses End (half the pane) and Home (180) after the arrow keys.

### Mutation probes

Both probes were restored. File rows and directory rows use the roving `tabIndex` again, and directory children render unconditionally.

1. Roving tabindex. Both treeitem `tabIndex` expressions were set to `0`.

   Command: `pnpm --dir desktop/packages/ui exec vitest run src/components/views/ReviewFileRail.test.tsx -t "uses one tab stop"`

   Result: exit 1. `ReviewFileRail > uses one tab stop and moves focus with the tree keys` failed at `ReviewFileRail.test.tsx:465`. `tabbable()` had length 5 (expected 1). Restored.

2. Mounted collapsed rows. The group rendered `{open ? renderTreeNodes(node.children) : null}`.

   Command: `pnpm --dir desktop/packages/ui exec vitest run src/components/views/ReviewFileRail.test.tsx -t "keeps collapsed file rows mounted"`

   Result: exit 1. `ReviewFileRail > keeps collapsed file rows mounted for selectors and assistive technology` failed at `ReviewFileRail.test.tsx:533`. `reviewFileRow("src/a.ts")` was `null` (expected a mounted row). Restored.

### Verification after these fixes

`pnpm --dir desktop/packages/ui run type-check` — passed (`tsc --noEmit`, exit 0).

`pnpm run lint` — passed (electron, ui, and web eslint, exit 0).

`pnpm --dir desktop/packages/ui exec vitest run src/components/views` — 353 passed, 1 failed (354 tests; 47 files passed, 1 failed).

The failure is the same pre-existing catalog mismatch: `src/components/views/SettingsView.models.test.tsx` > `translated Advanced group search finds the same destinations` throws `Invalid language catalog` at `src/lib/i18n/store.ts:55`. The five rail keys are still only in `en.ts`. Locales were not edited. The earlier 344 passing tests plus these 9 rail tests are the 353.

No commit. Branch remains `r11-rail-tree`.
