# Predictable Settings navigation implementation plan

Date: 2026-10-20. Scope authorized by the
[PRD](../prd/PRD-2026-10-20-settings-navigation-v1.md), including the approved Advanced Hooks arrangement.

1. Record the official consistency/grouping references and source findings before implementation. Preserve availability,
   mobile detail history, route slugs, draft/save semantics and exact SDK/runtime pins.
2. Introduce one canonical group/order model; replace the ungrouped view-local order. Add labeled semantic groups and
   translations. Filter within that fixed structure and include translated group labels in Settings search.
3. Add meaningful model/mounted checks for complete unique destinations, stable order after navigation/search/clear,
   Advanced discovery and asynchronous capability changes. Verify selected pages are not redirected by filtering.
4. Extend native WebMCP coverage to inspect grouped order, search Advanced/Hooks/Behavior, clear and navigate; inspect
   wide/narrow light/dark screenshots. Rerun existing populated Hooks and complete Settings journeys on the final build.
5. Run focused and applicable full UI tests, typecheck, lint, locale and boundary checks. Record results and commit only
   scoped files. Keep the user's unrelated reference/runtime-pin/test changes intact. No push or release.

The preceding Hooks target repair is independently committed as `cc67cd3c`. Earlier six-model discussion informs product
positioning, not code review of this new layout. Group labels and relative order are product choices to evaluate, not a
claim that all navigation or assistive-technology behavior has been qualified.
