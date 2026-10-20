## Verdicts

**H6 — single-mode layout makes room for the rail: RESOLVED.**
`DiffView.tsx:1890-1901` wraps rail + content in a `flex min-h-0 flex-1` row; the content sibling is `min-w-0 flex-1` (1900), and the rail is a fixed 15rem/12rem flex item (`design-system.css:558-572`). Single-mode content (1741-1773) never hardcodes a width.

**H7 — no dependence on stacked mode or `hidden lg:flex`: RESOLVED.**
The rail renders at `DiffView.tsx:1891-1899`, outside the `isStackedView` branch (1737). Gating is size/device only (`DiffView.tsx:1451-1456`); grep for `hidden lg:flex` in `src/` returns zero hits and no CSS query hides `.review-file-rail`.

**H8 — always-on hint vs. narrow layout: RESOLVED (bounded).**
The bar is `shrink-0` + `truncate` inside `flex h-full flex-col overflow-hidden` (`DiffCommentSummaryBar.tsx:87-88`, `DiffView.tsx:1780`), so it cannot collapse the diff pane. The chat is `display:none`, not unmounted, at ≤56rem (`design-system.css:547-555`), so the advertised send still works (toast-visible). Residual wording issue only, no layout break.

**H9 — Cmd/Ctrl+Enter pane-scoped, skips inputs: RESOLVED.**
Bound to `closest("[data-review-changes]")` (`DiffCommentSummaryBar.tsx:70-82`; anchor at `DiffView.tsx:1778-1783`), requires Enter + meta/ctrl, rejects alt/shift/repeat/composing (74-75), and bails via `reviewKeyboardEventInTextControl` over `composedPath` (`useReviewProgressStore.ts:61-66`).

**M2 — staged vs working signature: OPEN.**
`reviewFileSignature` is `insertions:deletions:code` (`useReviewProgressStore.ts:27-29`) and `getGitChangeSymbol` returns only the index letter when present (`changeDescriptors.ts:21-29`), so `MM` and `M ` both yield `"M"`. Per-scope keys (store:23-25) separate staged/working views, but in scope `all` a staged↔working redistribution with equal combined counts keeps the file marked viewed.

**L2 — size bound on viewed map: OPEN.**
`marks` is an unbounded `Record` (`useReviewProgressStore.ts:69,79-96`); `clearDirectory` (97-111) has no production caller (only its test), and stale-signature/deleted-file entries are never evicted.

## New defects

1. **No view-mode control in the 640–768px desktop band.** `isMobileLayout` (950) hides `DiffViewModeSelector` (1836), while `showFileRail` is true at paneWidth ≥ 640 (1451-1456) so `showFileSelector` is false (1457) — the in-dropdown mode selector (1844) never mounts. `DiffView.tsx:950,1451-1457,1836-1848`.
2. **Hint bar shows in states with nothing to comment on.** Rendered unconditionally at `DiffView.tsx:1902` while `renderContent` early-returns for no-directory/non-git/zero-changes (1704-1735). `DiffView.tsx:1704-1735,1902`.
3. **Rail click drops a staged view.** `onSelectFile={handleSelectFileAndScroll}` (1897) sets `setSelectedFileStaged(false)` (1395-1397), so in scope `all` any rail click silently reverts a staged selection to the working diff. `DiffView.tsx:1387-1409,1897`.

Read-only review; no build or test run performed.