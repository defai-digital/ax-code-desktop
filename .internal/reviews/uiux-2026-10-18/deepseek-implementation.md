# Deepseek implementation review

Date: 2026-10-18
Runner: AX Code, read-only, write/shell/task tools denied.
Terminal status: completed, process exit 0.
Input: scoped TS/CSS diff before follow-up fixes; locale and documentation files were excluded.
These are reviewer leads; see the implementation report for verified dispositions.

## Review summary

Static, read-only review of the supplied diff. Nothing was executed; findings below are derived from the diff text only. Scope matches the stated candidate (permissions, statuses, navigation, responsive rows, inspector labels).

## Verified source issues

**1. High (conditional on message files): new i18n keys are referenced but not added.**
`WorkspaceNavigation.tsx` uses `header.navigation.mainAria`, `supervision.navigation.workspace`; `InspectorRail.tsx` uses `supervision.inspector.tools/showLabels/hideLabels`; `MissionControlHeader.tsx` uses `supervision.missionControl.density/comfortable/compact/filterLabel`; `RequestActionCard.tsx` uses `supervision.request.scopeCount`. No i18n message file is in the diff. If these keys are not already present, `t()` either fails typecheck (`I18nKey`) or renders raw keys at runtime. Every new test mocks `t` as identity, so the suite will not catch it. Fix: add all keys to `lib/i18n/messages/en.ts` and other locales, then run typecheck.

**2. Medium: Mission Control keyboard handler now hijacks the new density `<select>`.**
`MissionControl.tsx` (§ keydown guard) changed the exclusion to `target.closest("button, a[href], summary")`. The new density control (`MissionControlHeader.tsx`) is a `<select>` inside the board’s `onKeyDown` subtree. Space/Enter/j/k pressed on the focused select will bubble and be treated as board shortcuts instead of opening/using the select. Fix: extend the guard to `select, input, textarea, [contenteditable="true"]` (and return early on `event.defaultPrevented`).

**3. Medium: mobile loses persistent Board/Review navigation.**
`Header.tsx` removes the Mission Control `HeaderIconActionButton`, while `MainLayout.tsx` renders `{!isMobile ? <WorkspaceNavigation /> : null}`. The only remaining desktop entry is the new nav; on mobile the board/review entry points are gone unless another surface exists (unverified). Fix: render a compact icon-only nav on mobile, or retain the header button on mobile.

**4. Medium: permission-scope disclosure can be a no-op.**
`RequestActionCard.tsx`: `needsExpansion` uses `patterns.join(" · ").length > 160`, but the collapsed list truncates each pattern independently. Two patterns of ~100 chars produce `needsExpansion === true` while the collapsed UI already shows both in full; the “N scopes” toggle then changes nothing (`aria-expanded` flips only). Fix: compute the predicate from what is actually hidden, e.g. `patterns.length > PREVIEW_PATTERNS || patterns.slice(0, PREVIEW_PATTERNS).some(p => p.length > PREVIEW_CHARACTERS)`.

**5. Medium-low: badge detaches from its icon when labels expand.**
`InspectorRail.tsx`: badges remain `absolute -right-0.5 -top-0.5` on a button that is now `w-full` and 10rem wide when expanded, so the count floats at the far right edge instead of over the icon. Fix: wrap the `<Icon>` in a `relative` span and anchor the badge there.

**6. Medium-low: collapsed rail toggle is text-only in a 3.25rem rail.**
`InspectorRail.tsx` always renders `{t("supervision.inspector.tools")}` in the toggle; no icon is shown when collapsed. The 52px rail (minus padding) forces wrapping/overflow for longer locales and provides no obvious expand affordance. Fix: render an expand icon (e.g. panel/sidebar icon) when collapsed, hide the text, and expose the label via tooltip/aria.

**7. Medium-low: accessible name violates label-in-name (WCAG 2.5.3).**
`InspectorRail.tsx` toggle: visible text is “Tools”, but `aria-label` is “Show labels”/“Hide labels”. Speech-input users cannot target the control by its visible label. Fix: include the visible text in the name, e.g. ``aria-label={`${t("supervision.inspector.tools")} — ${t(...)}`}``.

**8. Low: Workspace nav does not normalize `activeMainTab`.**
`WorkspaceNavigation.tsx` `run` handlers only close the board/review; they never call `setActiveMainTab("chat")`. If desktop can display a non-chat main tab, “Workspace” can read as active while the user is elsewhere and clicking it is a no-op, and “Review” opens a diff split beside that other view. The test asserts `activeMainTab === "chat"` but starts from chat, so it is vacuous. Verify whether non-chat main tabs exist on desktop; if so, route both actions through the existing `mainTabGuard` path.

**9. Low: blocked navigation is silent.**
`if (openBesideChat("diff")) leaveBoard()` discards the failure case: when the unsaved-editor guard rejects, the board stays and nothing tells the user. `closeBesideChat("diff")` in the Workspace branch ignores its return value as well; if close is ever guarded, the bar would show neither Workspace nor Review active while the diff remains open. Fix: surface the guard result (toast/inline notice) and only clear board state on confirmed close.

**10. Low: sidebar status semantics shift.**
`SessionNodeItem.tsx`: `running` dot changes from `bg-primary` to success green, and `done_with_uncommitted` from warning/60 to the `review` info dot. This is consistent with the new central presentation, but “done with uncommitted work” loses its warning affordance. Confirm this is intended product semantics, not just color matching.

**11. Low (compile-time risk):** `presentation.ts` assigns `icon: "loader"` / `"time"` for running/idle, which the badge never renders (it renders dots), but those values are still checked against `IconName`. Verify they exist. Also, `SessionNodeItem.tsx` places the alias import above `import React`; this may trip `import/order`.

## Test gaps
- i18n mocked out, masking missing keys.
- No coverage for the 2×100-char no-op disclosure.
- No keyboard test for the density select (finding 2).
- `WorkspaceNavigation` “activeMainTab” assertion is vacuous.

## What looks correct
The `respondingRef` guard fixes same-tick double decisions; making the mount effect set `mountedRef.current = true` fixes the StrictMode stuck-busy bug in the old effect. Centralizing state presentation and consolidating the filter group to `aria-pressed` are sound. Persisted `density`/`inspectorLabels` are validated and migrated safely. `motion-safe:` animation changes are an accessibility improvement.

## Verification still required
Run typecheck, lint, and the new Vitest files; grep the locale files for the listed keys; manually check the density select with keyboard only at narrow widths, mobile entry to Mission Control, and the expanded rail at ≤44rem for Escape/outside-click dismissal.
