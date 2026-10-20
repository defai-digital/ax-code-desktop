# Predictable Settings navigation v1

Status: Accepted for implementation on 2026-10-20. The user requested sorting Settings, applying best practices,
approved the Hooks arrangement and requested assessment of other Advanced candidates.
Related: [Hooks positioning](PRD-2026-10-20-hooks-positioning-v1.md).

## Problem and evidence

The current list jumps between host/model setup, personal preferences, projects and runtime customization. It has a
fixed ungrouped array, not a usage-based sorter. Its fuzzy filter preserves input order; do not claim that relevance
ranking caused automatic reordering. Local Models visibility can change after an asynchronous capability check; retain
the established availability/direct-link behavior and stable relative order of remaining entries.

[W3C consistent-navigation guidance](https://www.w3.org/WAI/WCAG22/Understanding/consistent-navigation.html) supports
predictable repeated order and spatial memory. [Material's archived Settings pattern](https://m1.material.io/patterns/settings.html)
supports grouping related settings and avoiding unnecessary screens. These inform the design; they do not prescribe
AX's exact categories or establish full accessibility conformance.

## Authorized layout

| Fixed group | Fixed order | Reason |
| --- | --- | --- |
| Preferences | Appearance, Chat, Sessions, Notifications, Shortcuts | Routine personal experience and interaction |
| Projects | Projects, Git | Workspace and repository setup |
| Models and connections | Providers, Local Models | Cloud/local model connectivity; preserve host availability behavior |
| Coding | Agents, Commands, Skills, MCP | Core agent setup, reusable actions and integrations, including the product's WebMCP positioning |
| Advanced | Behavior, Hooks | Global instruction overrides and runtime lifecycle diagnostics |

Use visible noninteractive group headings. Advanced remains discoverable without an additional collapsed screen.
Behavior includes response style as well as global instructions; keep its existing controls together in this bounded
navigation change, and include style/instruction keywords in search. Do not move common provider setup, permission
decisions or MCP connectivity behind Advanced merely because they are technical. Existing within-page Advanced editors
and remote options retain their placement.

## Acceptance

- One canonical grouping/order drives desktop and mobile navigation. No activity-based, locale-alphabetic or
  search-score reordering; filtering preserves relative order and clearing search restores the complete available list.
- Page selection, deep links, draft state and Settings search remain functional. Search includes translated group names
  and specific keywords so Advanced does not obscure Hooks or response style.
- Stable IDs and accessible group labels relate headings to their contents. Headers do not become extra action buttons.
- Test page changes, search/clear, a completed host capability check, close/reopen and supported viewport changes.
- Inspect populated navigation at wide/narrow widths and light/dark themes. Run mounted tests, locale checks, UI
  typecheck/build and native Settings journeys. Record evidence and limitations; make a scoped local commit.

No runtime execution, trust, save protocol, ownership or release-policy change is part of this navigation work.
