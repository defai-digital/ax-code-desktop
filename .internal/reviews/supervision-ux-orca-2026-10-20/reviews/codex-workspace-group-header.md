1. **P2 — Long project names can overflow the workspace navigation.** [WorkspaceNavigation.tsx:83](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/supervision/WorkspaceNavigation.tsx:83)  
   The project label uses `shrink-0` without a width limit or truncation. A long unbroken label can exceed the breadcrumb’s `max-w-full`, squeezing the path and branch to nothing and overflowing a narrow workspace. Allow the label to shrink and truncate, or wrap it with a bounded width.

2. **P2 — The group path can misrepresent the grouped sessions.** [MissionControlGroupHeader.tsx:24](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/supervision/missionControl/MissionControlGroupHeader.tsx:24)  
   `group.directory` comes from the first urgency-ranked session, whereas grouping uses project ID. Sessions in different subdirectories or worktrees can therefore share a header displaying only one session’s directory; that path can change when urgency changes. Replacing the disambiguated label with the registry name compounds this by removing the project-root context. Use the registered project’s path for registered groups, falling back to `group.directory` for unregistered groups.

3. **P2 — The evidence summary is not reliably accessible.** [MissionControlGroupHeader.tsx:64](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/supervision/missionControl/MissionControlGroupHeader.tsx:64)  
   `aria-label` is attached to a plain `<span>`, whose implicit generic role does not support an accessible name. Assistive technology may expose only the visible additions/deletions, losing the file count supplied exclusively through the label. Render the formatted summary as visually hidden text and mark the decorative numeric rendering `aria-hidden="true"`.

**Simpler equivalents:** At [MissionControlHeader.tsx:137](/Users/akiralam/code/ax-code-desktop/desktop/packages/ui/src/components/supervision/missionControl/MissionControlHeader.tsx:137), a single `<kbd>{shortcutHint}</kbd>` preserves the shortcut without splitting an already formatted string into indexed elements. The original labeled density `<select>` also provides equivalent selection behavior with substantially less markup, if separate buttons are not a design requirement.

The resolver import is correct. The group header’s separate class preserves `.mission-control-row` counts, and the supplied changes do not alter the `"Open —"`/`"Details —"` action prefixes.

Read-only source review; no tests or rendered-layout verification performed.