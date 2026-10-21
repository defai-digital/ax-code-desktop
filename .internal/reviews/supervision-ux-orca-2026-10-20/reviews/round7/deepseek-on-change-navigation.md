## Correctness Review — F7 / Shift+F7 hunk navigation

Single-pane logic (no wrap, zero-hunk skip, deferred `first`/`last` resolution) is correct and well tested. Findings below are ordered by severity. No benchmarks run (no shell in this session); perf items are static analysis.

**1. HIGH — Store is a module singleton, not pane-scoped** `lib/reviewHunkRegistry.ts:32-37,92,158-161`
Scenario: two `DiffView`s can be mounted at once (`MainLayout.tsx:306` split-pane `diff` + `:367` main tab; `ContextPanel-impl.tsx:2547` beside-session). `cache`/`focus`/`pending`/`resume` are keyed by path only, so with the same path visible in both panes the second `publishReviewHunks` overwrites the first's anchors, *both* panes apply the highlight, and a zero-hunk `resume` fires **both** panes' `onStore` (`useReviewHunkKeys.ts:122-128`) so one pane walks its rail on the other's behalf. One pane's `scopeKey` effect (`:105-107`) also wipes the other's focus.
Fix: add a per-pane `scopeId` and key cache/focus by `scopeId|path` (or hold one store instance per pane).

**2. MEDIUM — Key omits directory; scope key omits directory** `DiffView.tsx:1639-1643`, same publish path
`hunkScopeKey` is `git:${diffScope}`, so switching project while `src/app.ts` stays selected keeps the stale cursor against new anchors (registry clamps to last hunk, `reviewHunkRegistry.ts:115-121`) → jumps to the wrong change.
Fix: include `effectiveDirectory` in both the scope key and the published key.

**3. MEDIUM — Index-only anchor drifts after edits** `reviewHunkRegistry.ts:115-121`
If an agent edit inserts hunks above the focused one, the index still validates and scrolls to an unrelated change.
Fix: store the anchor `{line, side}` and re-resolve to the nearest line on republish.

**4. MEDIUM — Second uncached full parse per file** `usePublishReviewHunks.ts:23`, `diffHunkRevert.ts:8-11`
`parseDiffFromFile` runs again for every mounted viewer on each content change, while `DiffHunkReviewList.tsx:38` already parses the same file (memoized). Stacked review of N expanded files roughly doubles parse cost on open and after every refresh; `ReviewHunkMeasure` also parses large/binary files just to learn "0 hunks" (`DiffView.tsx:948`, `BranchChangesView.tsx:324,331`).
Fix: one memoized `getFileHunks` cache keyed by `path + content hash`, shared with the list.

**5. MEDIUM — Highlight re-applied at scroll rate** `PierreDiffViewer.tsx:803-819`
The observer watches `childList/subtree` on the shadow root, which fires per virtualized scroll frame, and now runs `clearReviewHunkHighlight` + full `querySelectorAll` scans + `markHeader` each time. No loop today only because attributes are not observed (`:821-823`) — fragile.
Fix: skip when the line already carries `data-review-hunk-focus`, and gate re-application on `pendingHunkScrollRef`.

**6. LOW/MEDIUM — Silent boundary for screen readers** `useReviewHunkKeys.ts:141-143`
`preventDefault()` then `if (!target) return`: at the last hunk nothing is announced (locked in at `useReviewHunkKeys.test.tsx:83-85`). Also blocks native Alt+Down behaviour when nothing moves.
Fix: announce "Last change in review" / "First change".

**7. LOW — Focus is visual only** `ReviewHunkAnnouncer.tsx:17`
DOM focus never moves; `aria-current` sits on non-interactive shadow-DOM divs, and the live text omits the hunk header, so the change itself is never read.
Fix: include the header in the announcement; make the marked line `tabindex=-1` and focus it.

**8. LOW — Platform reachability** `lib/shortcuts.ts:461,468`
F7 needs Fn on macOS; Alt+↑/↓ may be intercepted by Linux WMs before the app, leaving the alias dead.
Fix: note Fn in `helpDialog.item.nextChange`; consider plain `n`/`p` in-pane like `v`.

**9. LOW — `suppressClearRef` can leak** `useReviewHunkKeys.ts:84-88,109-116`
If selection does not actually change (already-selected path, or two moves in one React batch), the flag stays `true` and the next genuine file change skips clearing → stale focus.
Fix: reset the flag in an effect keyed on the selected value, not unconditionally.

Typing safety (`input`/`textarea`/`contenteditable` via `isContentEditable`, IME `isComposing`, `defaultPrevented`) is correctly handled; terminal keys cannot reach this listener because it is bound to the review pane. No terminal/IME finding.