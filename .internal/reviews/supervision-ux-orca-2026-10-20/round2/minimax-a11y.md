## Accessibility review — supervision UI

**1. HIGH — Grid "selected" means bulk-checked; the keyboard-active row has no programmatic marker.** `MissionControlRow.tsx:102` sets `aria-selected={bulkSelected}`, while `:113` styles the real active row and `MissionControl.tsx:511` drives `aria-activedescendant`. Screen-reader users hear "selected" for a *checked* row and nothing for the row their focus is on.

**2. HIGH — Toasts cannot be reached or dismissed by keyboard.** `ui/sonner.tsx:40` forces `tabindex="-1"` on every toast and `:85` sets `closeButton={false}`. `MissionControl.tsx:453-454` reports bulk stop/archive succeeded/failed/skipped *only* via toast — announced, but unreachable and undismissable.

**3. HIGH — The scope radiogroup is not keyboard-operable.** `DiffView.tsx:1950-1963` declares `role="radiogroup"`/`role="radio"` + `aria-checked` but has no roving `tabIndex` and no arrow-key handler (none exists in the file). Each of 4–5 scopes is a separate Tab stop, contradicting the ARIA pattern.

**4. MEDIUM — Row shortcuts die on the row's own checkbox.** `MissionControl.tsx:254` bails on any `closest("input…")`; the selection checkbox (`MissionControlRow.tsx:117`) is the row's first tab stop, so x/j/k/Enter/Space do nothing until the user Shift+Tabs back to the grid.

**5. MEDIUM — No way to extend a multi-selection.** `MissionControl.tsx:230` returns early for every Shift-modified key except `/` and Shift+X. Shift+Arrow never extends selection; only "select all" or per-row checkboxes remain.

**6. MEDIUM — First bulk selection is silent.** `MissionControlBulkBar.tsx:47` puts `role="status"` on a node mounted *with* its text, only when `MissionControl.tsx:645` sees `bulkRows.length > 0`. Live regions must pre-exist; 0→1 is never announced.

**7. MEDIUM — Commit textarea has no accessible name.** `git/CommitInput.tsx:60-71` has no label or `aria-label`; `placeholder` is the only source and vanishes on typing.

**8. MEDIUM — Comment bar appears silently.** `DiffCommentSummaryBar.tsx:87` returns null at zero drafts and `:96-104` carries no `role="status"`/`aria-live`, so the first draft materializes with Send/Discard unannounced.

**9. MEDIUM — Empty state is silent.** `SessionChangesView.tsx:290-295` has no live semantics (the error branch at `:276` correctly uses `role="alert"`).

**10. LOW —** Details row breaks the column model: one `gridcell` (`MissionControlRow.tsx:230`) vs. up to six (`:116-178`). Redundant `aria-checked` on a native checkbox (`MissionControlGroupHeader.tsx:53` vs `:30-34`). No announcement after prev/next file (`DiffView.tsx:1919-1932`). Three tab stops per rail row (`ReviewFileRail.tsx:145,173,187`).

**No blocking issue:** confirm dialogs (`ConfirmDialog.tsx:60-91`, Radix focus trap + labelled), the hover-hidden rail open button (`design-system.css:853-865`, `opacity:0` + `:focus-visible` keeps it focusable), CommandPalette (cmdk listbox, badge text at `SupervisionStateBadge.tsx:13`), and undecorated `<Icon>` calls (`Icon.tsx:50` defaults `aria-hidden`).