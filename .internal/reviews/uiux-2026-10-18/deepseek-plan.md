## Verdict

The plan is directionally sound and stays within UI scope, but two claims are not supported by the supplied snapshot, and Finding 3 needs an explicit control mapping before implementation. Findings 1, 4, and 5 are well grounded.

## Plan claims not supported by the source

- **“live sidebar” status presentation** — no sidebar status component or state rendering is in the snapshot. Treat as unverified follow-up; do not claim parity without locating it.
- **“review-changes” primary action** — the header excerpt shows Mission Control, notification, terminal, split pane, WebMCP, right sidebar, plan/context, but no review-changes control. Verify the actual control before renaming or regrouping.
- **“session workspace”** is ambiguous: split pane, right sidebar, and inspector rail all touch workspace surfaces. Define which control owns this label.
- **Duplicate panel controls** — the only proven duplicate is terminal (`toggle_terminal` in header and `TERMINAL_ENTRY` in the rail). Other duplicates are unproven; do not consolidate by guess.
- **Container-width responsiveness** — no Tailwind config/container-query setup is supplied. If `@container` is unavailable, use a small ResizeObserver hook rather than adding a plugin.
- **Eight rail actions** is correct (7 entries + terminal). **Density state** does not exist today and must be added (UI-only).

## Concrete recommendations and pitfalls

### 1. Permission card scope

- Render plain text when `patterns.length <= 2`; otherwise a native `<details>` with summary `Scope: 2 of N patterns` and a complete `<ul>` of patterns. Remove `line-clamp-2` inside the disclosure; use `break-words`.
- Keep `<summary>` text-only; do not nest buttons. Native details provides `aria-expanded`/keyboard behavior. Ensure summary clicks do not bubble into row selection in peek/queue contexts.
- Keep allow/deny outside the disclosure and always visible. Add a `busyRef` in addition to `disabled` so rapid same-tick clicks cannot double-dispatch `respondToPermission`.
- “Expose all scope before approval” is satisfied by count + disclosure; auto-expanding every card harms compact lanes. Do not force `onOpen`.
- New i18n keys are required in every locale; none exist in the snapshot.

### 2. Shared status presentation

- Create one data module (e.g. `lib/supervision/statePresentation.ts`) exporting `{ icon, labelKey, toneClass, indicator }` per `SupervisionState`; consume it in `MissionControlRow`, `MultiRunCompare`, and the sidebar once found.
- Resolve the current contradiction: compare uses `review=success`, `running=info`; plan says `review=info`, `running=success`. Pick the plan’s mapping and update compare. Keep the row’s pulsing dot for running.
- Normalize tokens: row uses `text-destructive`; compare uses `--status-error`. Pick one and alias the other. Status must remain text + icon, never color-only.

### 3. Primary navigation

- Add a shared labeled action wrapper around `HeaderIconActionButton`, showing icon + visible label at `lg+`, icon-only with tooltip below. Wrap primary actions in `role="group" aria-label="Primary"`, utilities in a separate group; preserve `aria-pressed`, `title`, shortcuts, and `data-header-panels`.
- Do not remove the header terminal control: the rail returns `null` on mobile, so mobile would lose terminal access.
- Verify shortcut handlers remain registered independently of button visibility.
- Label-in-name: visible label must be contained in the accessible name.

### 4. Mission Control density/responsiveness

- Add `density: "comfortable" | "compact"` to `MissionControlRow`; use a two-line layout: line 1 status + title + primary action, line 2 project/evidence/age. Keep `role="row"`, `id="mission-row-*"`, `aria-selected`, `aria-expanded`, and the grid focus handoff.
- Replace viewport `sm:block` hiding of project with second-line placement so project/title/primary remain visible at narrow container widths.
- Change header from fixed `h-12` to `min-h-12 flex-wrap`; let the `ml-auto` group wrap; keep close and dispatch reachable; tablist already scrolls horizontally.
- Avoid nested focusable elements inside the row; compare/remove must keep `stopPropagation`.

### 5. Inspector rail labels

- Add a leading toggle with `aria-expanded` and `aria-controls`, expanding to a labeled width (~11rem). Preserve the exact eight entries, order, `aria-pressed`, badges, and focus order (no roving tabindex unless explicitly designed).
- Visible labels at expanded width; suppress tooltips while expanded; Escape collapses labels only, not the active view. Keep terminal below the divider; mobile behavior unchanged.
- If expansion overlays chat, verify collapsed state does not intercept clicks.

## Acceptance criteria

1. Every permission pattern is reachable; count is explicit; allow/deny unchanged and single-dispatch.
2. Question cards render/answer exactly as before; no `<details>` for non-permission entries.
3. All three surfaces derive icon/label/tone from one mapping; review=info, running=success; no color-only status.
4. Primary actions have persistent labels at wide widths, accessible names at all widths, grouped separately from utilities; shortcuts still work.
5. Mission Control at narrow container widths shows title/project/primary without horizontal clipping; row semantics and keyboard navigation intact; header controls all reachable.
6. Rail toggle exposes labels and the same eight actions; active state and terminal dock preserved; mobile unchanged.

## Essential behavioral tests

1. Permission with 3+ patterns: summary count correct, expand reveals every pattern verbatim, no truncation class.
2. Rapid double-click allow: `respondToPermission` called once; both buttons disabled while pending; failure shows toast and re-enables.
3. Summary toggle via keyboard does not select/open the row; `aria-expanded` flips.
4. Table-driven mapping test for all six states across row and lane; assert review/running tones.
5. Header nav: labels at wide breakpoint, accessible names at narrow, shortcut dispatch still works, no duplicate names.
6. Mission Control at 640/900px container: project/title/primary visible, `aria-activedescendant` navigation works, compare/remove do not select.
7. Header wrap: all controls present and clickable at narrow width.
8. Rail toggle: same eight buttons/order/pressed states before and after expansion; terminal still toggles; mobile renders nothing.

## Sequencing and risk

Implement 1 and 5 first (isolated), then 2 and 4 (shared state/layout), then 3 (highest ambiguity). Keep changes additive; do not touch `sessionActions` signatures, sync/runtime code, or release config. Main risks: i18n coverage, container-query availability, and removing terminal access on mobile.

Terminal receipt: {"type": "result", "timestamp": 1792314752415, "sessionID": "ses_-e5eb1b7d0c2ffeU6mXKDyZwHK", "status": "completed", "text": "## Verdict\n\nThe plan is directionally sound and stays within UI scope, but two claims are not supported by the supplied snapshot, and Finding 3 needs an explicit control mapping before implementation. Findings 1, 4, and 5 are well grounded.\n\n## Plan claims not supported by the source\n\n- **\u201clive sidebar\u201d status presentation** \u2014 no sidebar status component or state rendering is in the snapshot. Treat as unverified follow-up; do not claim parity without locating it.\n- **\u201creview-changes\u201d primary action** \u2014 the header excerpt shows Mission Control, notification, terminal, split pane, WebMCP, right sidebar, plan/context, but no review-changes control. Verify the actual control before renaming or regrouping.\n- **\u201csession workspace\u201d** is ambiguous: split pane, right sidebar, and inspector rail all touch workspace surfaces. Define which control owns this label.\n- **Duplicate panel controls** \u2014 the only proven duplicate is terminal (`toggle_terminal` in header and `TERMINAL_ENTRY` in the rail). Other duplicates are unproven; do not consolidate by guess.\n- **Container-width responsiveness** \u2014 no Tailwind config/container-query setup is supplied. If `@container` is unavailable, use a small ResizeObserver hook rather than adding a plugin.\n- **Eight rail actions** is correct (7 entries + terminal). **Density state** does not exist today and must be added (UI-only).\n\n## Concrete recommendations and pitfalls\n\n### 1. Permission card scope\n\n- Render plain text when `patterns.length <= 2`; otherwise a native `<details>` with summary `Scope: 2 of N patterns` and a complete `<ul>` of patterns. Remove `line-clamp-2` inside the disclosure; use `break-words`.\n- Keep `<summary>` text-only; do not nest buttons. Native details provides `aria-expanded`/keyboard behavior. Ensure summary clicks do not bubble into row selection in peek/queue contexts.\n- Keep allow/deny outside the disclosure and always visible. Add a `busyRef` in addition to `disabled` so rapid same-tick clicks cannot double-dispatch `respondToPermission`.\n- \u201cExpose all scope before approval\u201d is satisfied by count + disclosure; auto-expanding every card harms compact lanes. Do not force `onOpen`.\n- New i18n keys are required in every locale; none exist in the snapshot.\n\n### 2. Shared status presentation\n\n- Create one data module (e.g. `lib/supervision/statePresentation.ts`) exporting `{ icon, labelKey, toneClass, indicator }` per `SupervisionState`; consume it in `MissionControlRow`, `MultiRunCompare`, and the sidebar once found.\n- Resolve the current contradiction: compare uses `review=success`, `running=info`; plan says `review=info`, `running=success`. Pick the plan\u2019s mapping and update compare. Keep the row\u2019s pulsing dot for running.\n- Normalize tokens: row uses `text-destructive`; compare uses `--status-error`. Pick one and alias the other. Status must remain text + icon, never color-only.\n\n### 3. Primary navigation\n\n- Add a shared labeled action wrapper around `HeaderIconActionButton`, showing icon + visible label at `lg+`, icon-only with tooltip below. Wrap primary actions in `role=\"group\" aria-label=\"Primary\"`, utilities in a separate group; preserve `aria-pressed`, `title`, shortcuts, and `data-header-panels`.\n- Do not remove the header terminal control: the rail returns `null` on mobile, so mobile would lose terminal access.\n- Verify shortcut handlers remain registered independently of button visibility.\n- Label-in-name: visible label must be contained in the accessible name.\n\n### 4. Mission Control density/responsiveness\n\n- Add `density: \"comfortable\" | \"compact\"` to `MissionControlRow`; use a two-line layout: line 1 status + title + primary action, line 2 project/evidence/age. Keep `role=\"row\"`, `id=\"mission-row-*\"`, `aria-selected`, `aria-expanded`, and the grid focus handoff.\n- Replace viewport `sm:block` hiding of project with second-line placement so project/title/primary remain visible at narrow container widths.\n- Change header from fixed `h-12` to `min-h-12 flex-wrap`; let the `ml-auto` group wrap; keep close and dispatch reachable; tablist already scrolls horizontally.\n- Avoid nested focusable elements inside the row; compare/remove must keep `stopPropagation`.\n\n### 5. Inspector rail labels\n\n- Add a leading toggle with `aria-expanded` and `aria-controls`, expanding to a labeled width (~11rem). Preserve the exact eight entries, order, `aria-pressed`, badges, and focus order (no roving tabindex unless explicitly designed).\n- Visible labels at expanded width; suppress tooltips while expanded; Escape collapses labels only, not the active view. Keep terminal below the divider; mobile behavior unchanged.\n- If expansion overlays chat, verify collapsed state does not intercept clicks.\n\n## Acceptance criteria\n\n1. Every permission pattern is reachable; count is explicit; allow/deny unchanged and single-dispatch.\n2. Question cards render/answer exactly as before; no `<details>` for non-permission entries.\n3. All three surfaces derive icon/label/tone from one mapping; review=info, running=success; no color-only status.\n4. Primary actions have persistent labels at wide widths, accessible names at all widths, grouped separately from utilities; shortcuts still work.\n5. Mission Control at narrow container widths shows title/project/primary without horizontal clipping; row semantics and keyboard navigation intact; header controls all reachable.\n6. Rail toggle exposes labels and the same eight actions; active state and terminal dock preserved; mobile unchanged.\n\n## Essential behavioral tests\n\n1. Permission with 3+ patterns: summary count correct, expand reveals every pattern verbatim, no truncation class.\n2. Rapid double-click allow: `respondToPermission` called once; both buttons disabled while pending; failure shows toast and re-enables.\n3. Summary toggle via keyboard does not select/open the row; `aria-expanded` flips.\n4. Table-driven mapping test for all six states across row and lane; assert review/running tones.\n5. Header nav: labels at wide breakpoint, accessible names at narrow, shortcut dispatch still works, no duplicate names.\n6. Mission Control at 640/900px container: project/title/primary visible, `aria-activedescendant` navigation works, compare/remove do not select.\n7. Header wrap: all controls present and clickable at narrow width.\n8. Rail toggle: same eight buttons/order/pressed states before and after expansion; terminal still toggles; mobile renders nothing.\n\n## Sequencing and risk\n\nImplement 1 and 5 first (isolated), then 2 and 4 (shared state/layout), then 3 (highest ambiguity). Keep changes additive; do not touch `sessionActions` signatures, sync/runtime code, or release config. Main risks: i18n coverage, container-query availability, and removing terminal access on mobile.", "permissionDenials": 0, "usage": {"input": 78994, "output": 1523, "reasoning": 4276, "cacheRead": 1280, "cacheWrite": 0}}
