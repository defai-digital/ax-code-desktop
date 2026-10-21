# Round 12 R10 review (MiniMax-M3, read-only)

I have enough to produce a read-only review. I could not invoke `git diff HEAD` (no `bash` tool in this turn and the agent's `task` call also lacked shell), but I read the modified files in full against the handoff's descriptions and the original test fixtures. Reporting findings below; no files modified.

---

## Review R10 — review rail tree and adjustable width

### Summary
**Overall:** NEEDS ATTENTION. No data-loss or store-coupling regressions, but there are recurring tab-order, focus-management, and conditionally-rendered-children issues that affect screen-reader and power-keyboard users, plus one confirmed regression risk for existing native journeys that query `[data-review-file]` after a directory is collapsed.

### Findings

#### [HIGH] — Tree mode puts every row in the document tab order (2000+ tab stops at scale)
- **Location:** `desktop/packages/ui/src/components/views/ReviewFileRail.tsx:239` (and `:334` for dir rows)
- **Current behaviour:** `tabIndex={treeRow ? 0 : undefined}` is set on every file `<div>` *and* every directory `<div>`. Each row is a separate tab stop, on top of the row's own internal `<button class="review-file-rail__select">` (Line 253), an `<button class="review-file-rail__open">` (Line 273) when `onOpenFile` is provided, and a checkbox (Line 287). Every WAI-ARIA tree pattern I've seen uses *roving tabindex* (one tab stop per tree, with arrow keys moving focus internally) precisely to avoid this. With the 2,000-file fixture (`ReviewFileRail.test.tsx:428`, `group-${index % 25}/file-${index}.ts`) the tree is 25 directory rows + 2,000 file rows = 2,025 tab stops, each carrying three more focusable descendants.
- **Expected impact:** Slow Tab travel through the rail; becomes user-visible whenever a single repo hits a few hundred files. The new 2,000-file test only checks memoization, not render cost or tab-order, so this slips through.
- **Recommendation:** Adopt roving tabindex — only the currently-focused treeitem is `tabIndex={0}`, all others are `-1`, and the container is the single tab stop. Or, if the author wants every row to be Tab-reachable, drop the redundant `tabIndex={0}` on the row and let the inner `<button>` be the tab stop.

#### [HIGH] — `data-review-file` rows are removed from the DOM when their directory is collapsed
- **Location:** `desktop/packages/ui/src/components/views/ReviewFileRail.tsx:353-361` (`open ? matches.children.map(...) : null`) and tests at `desktop/packages/ui/src/components/views/BranchChangesView.test.tsx:374,385` plus `SessionChangesView.test.tsx:694` (`document.querySelector("[data-review-file='src/new.ts'] …")`).
- **Problem:** When a directory is collapsed, every file under it disappears from the DOM entirely (`open ? … : null`). The handoff acknowledges this ("directories start expanded, so the existing `[data-review-file]` queries still see every file until a directory is collapsed"), but the journey tests and any external observer that selects by `[data-review-file]` will silently break the first time a user collapses a directory in the session before that test runs.
- **Expected impact:** Intermittent failures of native supervision journeys and any user-scripted selector. The collapse set is *in-memory only* (no storage; see `reviewFileRailTree.ts:300-318`), so once a directory is collapsed in a session it stays collapsed for every subsequent rerender and test in that session.
- **Recommendation:** Either render children but visually hide them (`aria-hidden`, `display:none`/`visibility:hidden`) — which keeps the rows queryable and ARIA-consistent — or filter `SessionChangesView`/`BranchChangesView`/any native selector pathway through `tree.ancestors` so the selector considers the visible state. Independently of this, `resetReviewRailForTests()` should also be called in `SessionChangesView.test.tsx` / `BranchChangesView.test.tsx` `beforeEach` so collapse state does not bleed between tests.

#### [MEDIUM] — Resize separator only handles ArrowLeft/ArrowRight; no Home/End/Home/Page support
- **Location:** `desktop/packages/ui/src/components/views/ReviewFileRail.tsx:212-217`
- **Current behaviour:** `onResizeKeyDown` returns early for everything except ArrowLeft/ArrowRight. WAI-ARIA APG recommends `Home`/`End` (jump to min/max) and many screen-reader users expect `PageUp`/`PageDown`. The separator has proper `aria-valuenow`/`aria-valuemin`/`aria-valuemax` (Line 460-462) but those exposed bounds are unreachable by keyboard.
- **Expected impact:** Keyboard-only users cannot quickly snap the rail wide or narrow.
- **Recommendation:** Add `Home → REVIEW_RAIL_MIN_WIDTH`, `End → reviewRailMaxWidth(paneWidth)`, `PageUp/PageDown → step × 4`.

#### [MEDIUM] — Tree-keyboard handler collapses/expands but never moves keyboard focus
- **Location:** `desktop/packages/ui/src/components/views/ReviewFileRail.tsx:366-405`
- **Problem:** `onTreeKeyDown` responds to ArrowRight/ArrowLeft by flipping `aria-expanded` (via `toggleReviewDirectory`) and to ArrowLeft on a file by collapsing the parent. None of these moves DOM focus to the treeitem that should now own focus (the first child after expand, the parent after collapsing a child). This is the core of the ARIA tree pattern (https://www.w3.org/WAI/ARIA/apg/patterns/treeview/) and it's missing. Visible in the mutation probe at `ReviewFileRail.test.tsx:335-355` — the test only asserts `aria-expanded` flips and the row appears, never the focus owner.
- **Expected impact:** Screen-reader and sighted-keyboard users have no indication of where their cursor is after expanding or collapsing a subtree; repeated ArrowLeft/Right produces no perceivable change in focus. With `presentation` divs interleaved (Line 325), focus restoration needs to be explicit.
- **Recommendation:** After toggling, move focus to the appropriate treeitem (`document.querySelector(\`[data-review-directory="${id}"]\`)`) so the next keystroke has a clear target. Pattern: ArrowRight on a closed directory → open *and* move focus to the first child; ArrowRight on an open directory → move focus to first child; ArrowLeft on a closed directory → move focus to parent; ArrowLeft on an open directory → close.

#### [MEDIUM] — Conditionally rendered children are not in the accessibility tree when collapsed
- **Location:** `desktop/packages/ui/src/components/views/ReviewFileRail.tsx:353-361` (same line as HIGH above).
- **Problem:** WAI-ARIA APG recommends keeping the collapsed children mounted and toggling `display`/`visibility`, otherwise screen-reader discoverability of files inside a long-closed directory depends on the AT's heuristics. `aria-expanded` is correctly bound (`:328`) but is the only signal. Pair this with the focus-movement gap above (MEDIUM-2) and a collapsed directory is essentially invisible.
- **Expected impact:** Hard-to-quantify SR-only regression. This also affects the recommendation in HIGH-2 about keeping selectors valid.
- **Recommendation:** Render the children, then `style={{ display: open ? undefined : "none" }}` so the DOM, the query selectors, and the accessibility tree all stay in sync.

#### [MEDIUM] — Outer `role="presentation"` div breaks the logical tree for screen readers
- **Location:** `desktop/packages/ui/src/components/views/ReviewFileRail.tsx:325-362`
- **Problem:** Every directory treeitem is wrapped in `<div key=… role="presentation">`. `role="presentation"` instructs ATs to ignore the element but pass children through; in practice, several major screen readers (NVDA + Firefox historically, JAWS with virtual cursor off) drop into a "form mode" through these wrappers and stop exposing row relationships. With the conditional-rendering pattern above, the wrapper is also useless as a container.
- **Recommended fix:** Use `<Fragment key=…>` instead so the treeitems are siblings of the surrounding tree.

#### [MEDIUM] — File rows have no `aria-label`, only an inner `<span class="title">`
- **Location:** `desktop/packages/ui/src/components/views/ReviewFileRail.tsx:230-307`
- **Problem:** The row's `tabIndex={0}` makes it focusable, but its accessible name comes from the inner spans (status, name, parent, +/− counts). Directory rows correctly set `aria-label={summary}` (`:330`). When a screen reader focuses a file row it has to walk down the descendant text, which is more brittle than a single explicit `aria-label`.
- **Recommendation:** Add `aria-label={\`${row.descriptor.code}, ${row.file.path}, ${row.file.insertions} added, ${row.file.deletions} removed\`}` for parity with directory rows.

#### [LOW] — Drag listeners attach directly to the handle and outlive unmount
- **Location:** `desktop/packages/ui/src/components/views/ReviewFileRail.tsx:187-210`
- **Problem:** `onResizePointerDown` calls `setPointerCapture` and adds `pointermove`/`pointerup`/`pointercancel` listeners to the handle element. If the component unmounts mid-drag (route change, settings close), the handlers are added to a soon-to-be-detached DOM node and only GC'd later. The pointer capture in particular may keep the OS pointer cursor locked to the detached node for one frame.
- **Expected impact:** Cosmetic; no functional leak.
- **Recommendation:** Either register on `window` and clean up in a `useEffect` cleanup, or `setPointerCapture` is sufficient if you also `removeEventListener` on unmount via an effect.

#### [LOW] — `compressDirectory` leaves orphan collapse keys for the rolled-up chain
- **Location:** `desktop/packages/ui/src/components/views/reviewFileRailTree.ts:72-87` (and key construction at `:213-215`)
- **Problem:** When a chain `a/b/c/d` is compressed to one row whose `id` is `c/d`, the collapse key `${directory}\0${scope}\0c/d` is added/removed at runtime. The intermediate ids `a`, `a/b` are never used, but if files change so that the chain becomes `a/b/c/d + sibling` and the chain breaks apart into `a/b/c`/`d`, any prior collapse key for `c/d` is dead. The set grows without an eviction path (only the user toggling can shrink it), but it's bounded by session-unique paths so it's not a real concern in practice — flagging for completeness.

#### [LOW] — Reveal effect re-fires on `selectedAncestors` ref churn
- **Location:** `desktop/packages/ui/src/components/views/ReviewFileRail.tsx:165-174`
- **Problem:** `selectedAncestors = tree.ancestors.get(selectedFile)` is computed every render. The effect's deps include it (`:174`), so any render where `tree.ancestors` is rebuilt (e.g., a file is renamed and the tree is rebuilt) causes the effect to fire; the `revealedFile` ref check correctly returns the early-exit branch (`:172`), so there's no behavior bug, but the dep array churns more than necessary. Memoize `selectedAncestors` on `[tree, selectedFile]` to silence the noise.

#### [LOW] — Storage reads happen at module-init time, before the React tree
- **Location:** `desktop/packages/ui/src/components/views/reviewFileRailTree.ts:257-261`
- **Problem:** `let snapshot = { mode: readStoredMode(), width: readStoredWidth() }` runs at module evaluation. In an SSR bundle, this hits `globalThis.localStorage?.getItem(...)`, returning null, then defaults. The values still happen to agree with `getReviewRailServerSnapshot()` today, so the hydration is consistent, but the `??`/default ladder is fragile if anyone later changes the defaults independently. Move the initial read into the `subscribeReviewRail`/`getReviewRailSnapshot` path so the server snapshot is the single source of truth pre-hydration.

### Things explicitly checked and confirmed clean
- **`store imports another store`:** `useReviewProgressStore.ts:8` imports only `orderReviewRailFiles` (a pure helper) from `./reviewFileRailTree`. No store-to-store import. ✅
- **`/`, `\` both separators:** `splitReviewPath` (`:18-24`) uses `lastIndexOf("/") | lastIndexOf("\\")`; `directorySegments` (`:26-29`) splits on `/[/\\]/`. Tested with `src\\b.ts` in `ReviewFileRail.test.tsx:270-288`. ✅
- **Collapse state is NUL-separated:** `reviewRailCollapseKey` at `reviewFileRailTree.ts:213-215`, unused keys can't collide. ✅
- **Original path reaches `onSelectFile`/`onOpenFile`:** `ReviewFileRail.tsx:253, 280` pass `row.file.path`. ✅
- **`/`, `\\` both separators, `/`-keyed ids:** build at `:131-152` joins with `/`. Selection tests pass the Windows-style path through unmodified. ✅
- **Mode persistence wraps `localStorage` in `try/catch`:** `readStorage`/`writeStorage` at `:229-243`; tested with a throwing `setItem` at `ReviewFileRail.test.tsx:417-424`. ✅
- **Mode and width are pure per-viewer:** storage keys `ax-code-review-rail-mode` / `ax-code-review-rail-width` (`:11-12`). Collapse set is intentionally in-memory (per the handoff). ✅
- **Memoization holds at 2,000 files:** `ReviewFileRail.test.tsx:426-439` verifies `buildReviewFileTree` does not re-run on same path list, including after marking viewed. ✅
- **`data-review-file`/`aria-current` kept on file rows, directories do not carry `data-review-file`:** `:234` (file), `:331` (dir has `data-review-directory`). ✅
- **Pointer drag respects RTL:** `:198` reads `getComputedStyle(handle).direction === "rtl"` and flips the delta sign. ✅
- **`revealReviewSelection` only emits when state changed:** `:332` early returns when `!changed`. ✅
- **`clampReviewRailWidth` honors 180 floor and half-pane ceiling:** `:207-211`. Mutation probe at handoff `R10-HANDOFF.md:51-56` confirms. ✅
- **`next`/`previous` reach files in collapsed dirs and re-expand them:** `ReviewFileRail.test.tsx:335-355`; mutation probe at handoff `:46-50` confirms. ✅
- **`getSafeStorage` exists for the progress store:** `stores/utils/safeStorage.ts` is unchanged by this PR. ✅

### Open from the handoff (re-stated)
- The five new i18n keys are in `en.ts` only; the other 13 catalogs still lack `diffView.rail.viewMode` / `viewTree` / `viewList` / `resize` / `directorySummary`. `loadDictionary` will throw for those locales until they are translated, which is what is causing the lone red test in `SettingsView.models.test.tsx` ("translated Advanced group search finds the same destinations"). Not a code bug — operationally blocking for any locale-gated CI run until `pnpm run check:locales` accepts the new keys.
- Native supervision journeys and a packaged desktop window were not exercised by this PR; their `[data-review-file]` selectors now have the collapse precondition described in HIGH-2.

### Recommendations (prioritized)
1. **HIGH:** Either adopt roving tabindex in the tree or drop the per-row `tabIndex={0}` so the inner button remains the single tab stop per row. Fixes an obvious slowness on Tab-with-many-files.
2. **HIGH:** Decide a single contract for `[data-review-file]` when collapsed (either render-and-hide, or update native selectors + seed `resetReviewRailForTests()` in journey test `beforeEach`). Prevents native journeys from breaking on first collapse.
3. **MEDIUM:** Move keyboard focus after toggling a directory (ArrowRight/Left, Enter). Required for the ARIA tree pattern.
4. **MEDIUM:** Add `Home`/`End` and `aria-label` on file rows for parity with directory rows.
5. **LOW:** The drag-listener-on-detached-node leak, the orphan collapse keys, the `selectedAncestors` dep churn, and the SSR-time `readStorage` module-init are minor cleanups worth doing in a follow-up but not blocking.