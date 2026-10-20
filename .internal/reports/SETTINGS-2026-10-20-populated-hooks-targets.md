# Populated Hooks and Settings project target repair

Date: 2026-10-20. Baseline `7723a594`. Scope: existing read-only configuration UI and isolated native harness.
[Pre-implementation plan](../plans/PLAN-2026-10-20-populated-hooks-targets.md).

## Findings and repair

Native WebMCP reproduced two Settings projects both named Shared Project and two long command expanders both named
Show full command. The [negative discovery](../reviews/hooks-targets-2026-10-20/negative-target-discovery.json) preserves
the ambiguous native inventory. Settings project labels now compare formatted/whitespace-normalized display names and
show wrapping paths for collisions. Menu action names include that context; unique names remain concise. Each command
expander includes event/row context and aria-controls, and expands only its own command without putting command text
in the action name.

Repeated selection exposed a harness assumption: Base UI radio items default to keeping the menu open. This single
project navigation now explicitly closes on selection, verified by mounted and native tests. Earlier harness attempts
also queried a global menu/trigger instead of the visible Settings target; final waits use fresh native state for that
exact control. These setup/expectation failures are not additional product defects.

## Verification

- Focused mounted tests: 13 passed. They cover formatted/basename/whitespace collisions, both selection directions,
  selection dismissal, independent expansion, load/error behavior and rejection of a previous project's late refresh.
- Full UI suite after the final production change: 566 files, 3,785 tests passed.
- Stub scenario suite: 18 passed. New opt-in Hooks fixture tests directory isolation, unchanged default response,
  delayed reads, failure status and telemetry. Fixture commands never execute.
- Typecheck, lint, build and boundary/release identity checks passed. Final build includes UI typecheck. App 7.27.3,
  SDK 2.6.37 and the user's existing runtime 7.27.7 pin remain unchanged by this repair.
- Two clean native runs: `/tmp/ax-hooks-verified1-20261020.log` and `/tmp/ax-hooks-verified2-20261020.log`, 30 UI actions
  each. Correct project payloads, independent expansion/collapse, scoped refresh, retained content on 503, recovery and
  a still-pending old-project refresh followed by completed response were verified. Old data did not replace the new
  project. Screenshots at 1280/800 CSS pixels and light/dark themes were inspected; expanded text wraps within bounds.
- Full Settings regression: 15 pages, 616 rendered observations passed in
  `/tmp/ax-hooks-settings-regression-20261020.log`. Ordinary 10-check E2E passed in
  `/tmp/ax-hooks-default-regression-20261020.log`.

Screenshots and generated receipts are local artifacts under the matching `/tmp/ax-hooks-verified*-20261020/`
directories; the committed script reproduces the scoped fixture journey. They are not packaged-app or live-hook proof.
Open file is covered by the mounted fallback test, not invoked against an external editor in the native journey.
The prior numeric focus/clamp lead remains separate; no numeric validation assertion was weakened.

The concrete-diff Grok/Muse attempts both timed out without findings; see the
[advisory record](../reviews/hooks-targets-2026-10-20/README.md). The later successful six-model product-value discussion
is a different request and does not constitute review of this code. No claim that all Settings behavior is bug-free,
or that actual hook execution and multi-project provider/MCP isolation are qualified, follows from these checks.
