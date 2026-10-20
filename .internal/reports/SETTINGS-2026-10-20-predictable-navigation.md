# Predictable Settings groups and Advanced placement

Date: 2026-10-20. Implementation of the accepted
[PRD](../prd/PRD-2026-10-20-settings-navigation-v1.md) and
[plan](../plans/PLAN-2026-10-20-settings-navigation-v1.md). Baseline `8d08ed64`.

## Result

Settings now presents fixed, visible groups: Preferences; Projects; Models and connections; Coding; Advanced.
Behavior and Hooks are under Advanced. Providers/Local Models remain model setup, Projects/Git remain project setup,
and Agents/Commands/Skills/MCP remain Coding. Advanced adds no collapsed screen. Existing within-page advanced controls
retain their placement; common functionality was not moved merely because it is technical.

The old list was fixed but logically interleaved, not automatically ranked by use. The source did not reproduce
activity-based reordering. One canonical group/order model now drives both layouts and derived metadata, including
CommandPalette's group field. Search filters without reordering; an exact translated group query selects that group.
Behavior's style keywords and Hooks diagnostics/trust keywords improve discovery. Search does not change the selected
page or its draft. Capability filtering preserves the relative order of remaining entries.

The design follows [W3C consistency guidance](https://www.w3.org/WAI/WCAG22/Understanding/consistent-navigation.html)
and the grouping principle in [Material's archived Settings pattern](https://m1.material.io/patterns/settings.html).
These inform the arrangement, not a claim of full accessibility conformance or measured comprehension improvement.

## Verification

- Final full UI suite: 567 files, 3,789 tests passed (`/tmp/ax-settings-groups-full-ui-final-20261020.log`).
- Focused metadata/navigation/mounted tests: 18 passed after the canonical metadata derivation. They cover complete
  unique destinations, inventory permutation, selected-page stability, translated Advanced search, search/clear and
  remaining order after a pending Local Models capability check resolves unsupported.
- Typecheck/build and lint passed, including final focused lint. Locale check: 14 locales, 4,937 keys and 64,181 entries.
  Final boundary/ownership/runtime-pin/release-identity checks passed; app 7.27.3, SDK 2.6.37 and runtime 7.27.7.
- Two final-build native navigation runs passed (`/tmp/ax-settings-groups-verified1-20261020.log` and `verified2`). Each
  checked 13 ordered inventories. The second also filled, retained and restored an unsaved Behavior draft through
  empty/clear search without saving. Its [receipt](../reviews/settings-navigation-2026-10-20/native-navigation-receipt.json)
  is committed. Screenshots at 1280x1000 and 800x700, light/dark, were inspected. Narrow navigation scrolls independently;
  Advanced remains reachable and its item order is unchanged.
- Populated two-project Hooks journey passed after regrouping: scoped selection/refresh, independent command expansion,
  retained error content, retry and completed late response isolation (`/tmp/ax-settings-groups-populated-hooks-20261020.log`).
- Complete Settings native audit passed: 15 pages and 616 observations (`/tmp/ax-settings-groups-audit-20261020.log`).

An ordinary E2E run exposed a pre-existing supervision reload-readiness problem: the test could observe the old mounted
board after a reload acknowledgement, then report zero targets during navigation. This failed run is retained under
`/tmp/ax-settings-groups-default-20261020/`; it is not reported as passing. The separately scoped
[repair plan](../plans/PLAN-2026-10-20-supervision-reload-barrier.md) requires a fresh document and mounted board before
the existing exact-one-window assertion. Its regression and final ordinary E2E results are recorded separately.
The [final reload-readiness report](E2E-2026-10-20-reload-readiness.md) records the subsequent main-window finding,
shared helper and two consecutive complete E2E passes plus failure-detection self-test.

Muse completed an advisory diff review; its duplicate-grouping lead was addressed by deriving metadata from the same
model. Other future-state leads are guarded by route/icon coverage or contradicted by mutually exclusive layout branches.
Grok timed out. See the [review disposition](../reviews/settings-navigation-2026-10-20/README.md).

## Limits

Native checks use the isolated unpackaged fixture app, not the installed application or a signed release. Mobile shares
the same renderer/model, but this run did not qualify a physical mobile device or assistive-technology interaction.
Screenshots and temporary logs remain local artifacts. Reading effective Hooks configuration and navigating Advanced
does not qualify actual shell hook execution, live provider/MCP isolation or durable scheduling. The broader active
bug-finding goal and prior numeric-focus lead are not completed by this navigation change.
