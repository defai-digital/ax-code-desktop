All evidence collected. Here is the verification report.

## Verification of A11y review — Mission Control grouped board

**1. HIGH — Invalid rowgroup ownership: CONFIRMED.**
`MissionControlRow.tsx:93` wraps every row in an unroled `<div className="border-b border-border/50">` sitting between `role="rowgroup"` (`MissionControl.tsx:495`) and `role="row"` (`MissionControlRow.tsx:96`), and the expanded peek `<div id="mission-details-*">` with buttons/select (`MissionControlRow.tsx:208`) is non-row content inside the rowgroup — both break the required `rowgroup → row → gridcell` ownership. (Mitigation exists — the grid's `aria-activedescendant` chain, `MissionControl.tsx:415`, still resolves rows by ID — but the structural defect is real.)

**2. HIGH — Inconsistent column counts: CONFIRMED.**
Rows emit 4 gridcells normally and 5 with goal/error (`MissionControlRow.tsx:111–157`, conditional cell at `:119–127`; the test asserts 4 at `MissionControlRow.test.tsx:78`), while the group-header row in the same rowgroup has a single gridcell (`MissionControlGroupHeader.tsx:20`) — column-oriented AT queries are inconsistent. (The "old board had 6 cells" history claim is unverifiable without git access; the current inconsistency stands on its own.)

**3. MEDIUM — DOM order ≠ visual order: CONFIRMED.**
`design-system.css:521` places `meta` on the first visual line and `description` below it at ≥52rem, while DOM emits description before meta (`MissionControlRow.tsx:119–157`); the same mismatch also exists in the default and narrow layouts (`design-system.css:481`, `:527`), so the reviewer slightly understated its scope.

**4. MEDIUM — aria-label on generic span: PARTLY.**
Both spans do carry `aria-label` on role-less elements (`MissionControlHeader.tsx:133–135`; `MissionControlGroupHeader.tsx:46–48`), which AT commonly ignores; the evidence half is real because visible text is only "+A −D" (`:50–51`) while the file count lives solely in `supervision.evidence.summary` = "+A −D · N files" (`src/lib/i18n/messages/en.ts:3165`), but the shortcut half is overstated — the `<kbd>` chips' visible text (`MissionControlHeader.tsx:137–141`) already exposes the combo keys, so little is actually lost.

**5. MEDIUM — Collapse strands keyboard nav: PARTLY.**
The code facts are accurate — the chevron keeps DOM focus (`MissionControlGroupHeader.tsx:30`), `handleKeyDown` bails on interactive targets (`MissionControl.tsx:230–238`), and no focus returns to the grid after collapse (`:500–507`) — but the `updateSelectedId` fallback (`:143`) is deliberate per its own comment ("must not replace the session Mod+Shift+H returns to", `:140–141`), so "desyncs selection" misreads intent, and "strands" is overstated since Tab and `aria-activedescendant` keep working; only j/k/arrows require refocusing the grid.

**6. LOW — Color-only borders: REJECTED.**
The tinted left borders exist (`MissionControlRow.tsx:103–107`), but every row's badge renders the state as text with a label (`SupervisionStateBadge.tsx:13`, `:31`), so color is never the sole cue and WCAG 1.4.1 is satisfied.

**Missed:** The ownership defect also applies in ungrouped mode — rows are rendered with no `rowgroup` at all, each still inside the unroled wrapper directly under `role="grid"` (`MissionControl.tsx:514` + `MissionControlRow.tsx:93`).