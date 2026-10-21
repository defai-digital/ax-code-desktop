## Verdicts (all citations opened against the snapshot)

**1. PARTLY** — `aria-selected={bulkSelected}` mismatch is real (MissionControlRow.tsx:102, active-row highlight at :113), but "no programmatic marker" is wrong: MissionControl.tsx:511 sets `aria-activedescendant` on the focused grid, which announces the keyboard-active row; the actual defect is that `aria-selected` conveys check-state instead of grid selection.

**2. CONFIRMED** — sonner.tsx:40 rewrites `tabindex="0"`→`"-1"` on every toast and :85 passes `closeButton={false}`; bulk stop/archive outcomes surface only via `toast.error/toast.success` (MissionControl.tsx:453-454), so announced but unreachable/undismissable.

**3. CONFIRMED** — DiffView.tsx:1951-1963 declares `role="radiogroup"`/`role="radio"` with `aria-checked` on plain buttons (no roving `tabIndex`), and grep shows the file has no `onKeyDown` at all (only `onPointerDown`, :1870), so each scope is its own Tab stop.

**4. CONFIRMED** — MissionControl.tsx:254-257 returns when `target.closest("input, textarea, select, [contenteditable]")`, and the row's first control in DOM order is that checkbox (MissionControlRow.tsx:117), so x/j/k/Enter/Space die there (:259 additionally bails on all buttons).

**5. CONFIRMED** — MissionControl.tsx:230 is literally `if (event.shiftKey && event.key !== "/" && event.key.toLowerCase() !== "x") return`; no Shift+Arrow extension logic exists.

**6. CONFIRMED** — MissionControlBulkBar.tsx:47 mounts `role="status"` together with its text, and the whole bar renders only when `bulkRows.length > 0` (MissionControl.tsx:645-646), so 0→1 is unannounced.

**7. CONFIRMED** — CommitInput.tsx:60-71 `<textarea>` has `aria-keyshortcuts` and `placeholder` but no label/`aria-label`.

**8. CONFIRMED** — the drafts bar (DiffCommentSummaryBar.tsx:96-114) is a plain div with no live semantics; one cite nit: at zero drafts `return null` happens at :88 only when `!showHint` (a hint otherwise renders).

**9. CONFIRMED** — SessionChangesView.tsx:276 uses `role="alert"` for errors while the empty branch at :290-295 is an unlabeled live-semantics-free div.

**10. CONFIRMED** — all four sub-claims check out: details row = one gridcell (MissionControlRow.tsx:230-231) vs up to six (:116/:127/:130/:136/:144/:178); `aria-checked` on a native checkbox (MissionControlGroupHeader.tsx:53 vs input at :48); no `aria-live` anywhere in DiffView.tsx after prev/next (:1905-1932, grep-verified); three interactive stops per rail row (ReviewFileRail.tsx:145, 173, 187).

**"No blocking issue" list: CONFIRMED** — ConfirmDialog.tsx:59-93 (Radix Dialog + DialogTitle/Description at :68-69); design-system.css:860-865 (`opacity:0` restored on `:focus-visible`); cmdk listbox (command.tsx:4); badge text (SupervisionStateBadge.tsx:13); Icon.tsx:50 defaults `aria-hidden="true"`.

**Missed (1):** MissionControlBulkBar.tsx:42 uses `role="toolbar"` without the ARIA toolbar focus pattern — no arrow-key roving focus, plain Tab stops across ~6 controls; benign but inconsistent with the role it declares.

**Overall:** 8 CONFIRMED, 1 PARTLY (overstated, defect real), 0 REJECTED; the negative claims are accurate.