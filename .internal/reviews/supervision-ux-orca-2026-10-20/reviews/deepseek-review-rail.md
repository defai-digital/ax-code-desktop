Checkpoint: objective was a read-only correctness review; deliverable was the ranked findings. Nothing written, so no implementation or verification run is required.

The review is complete. Findings below are unchanged by the restored tools; the one thing I could not do was execute `pnpm test`, because the shell tool was unavailable during the session. That limitation is already stated in the review and does not affect any finding, all of which come from source inspection with cited lines.

## Final answer

**1. Medium-High — shortcuts die unless focus is already inside the pane.** Listener bound to the pane element (`stores/useReviewProgressStore.ts:118-123`); root is `tabIndex={-1}` with no focus-on-pointerdown (`components/views/DiffView.tsx:1777-1783`). Clicking non-focusable diff text leaves focus on `body`, so `]`, `[`, `v`, Cmd/Ctrl+Enter no-op on the common path.

**2. Medium — `v` on a viewed file un-views it and advances.** `useReviewProgressStore.ts:135-152` toggles unconditionally, then scans forward. Un-marking therefore also moves selection and skips the file you just un-marked.

**3. Medium — viewed map grows unbounded; `clearDirectory` is unused.** `useReviewProgressStore.ts:90-104` has no production caller (only `useReviewProgressStore.test.ts`); nothing clears on directory/scope switch, unmount, or file removal.

**4. Low-Medium (candidate, unverified) — Cmd/Ctrl+Enter guard misses contenteditable.** `DiffCommentSummaryBar.tsx:76` uses `reviewKeyboardEventInTextControl`, which only matches `INPUT`/`TEXTAREA` (`useReviewProgressStore.ts:61-66`); the sibling `reviewKeyboardEventInEditableField` handles contenteditable. Unconfirmed whether any inline-comment editor in the pane is contenteditable.

**5. Low — rail subscribes to the whole `marks` map.** `ReviewFileRail.tsx:31`, with `rows` memo at `:34`, re-renders every row on each toggle.

**6. Low — `]`/`[` matching ignores Shift.** `useReviewProgressStore.ts:129-131` filters Ctrl/Meta/Alt only.

**Verified clean:** `data-review-changes`/`data-review-width` on the root (`DiffView.tsx:1781-1782`); `data-review-directory` carries the full path while text is `formatPathForDisplay` (`DiffView.tsx:1786-1790`), matching the e2e assertion (`desktop/packages/electron/scripts/e2e/supervision-workspace-webmcp.mjs:77`); signature reset on `insertions:deletions:code`; filter preserves totals; stacked navigation reuses `handleSelectFileAndScroll`. No real bug found in those areas.