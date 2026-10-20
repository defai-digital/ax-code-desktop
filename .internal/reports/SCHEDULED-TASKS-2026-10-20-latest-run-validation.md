# Validate latest-run identity before projecting task outcomes

## Evidence and repair

The full history adapter rejected malformed records, but the sidebar's latest-run path still trusted any
recognized status. A completed record carrying another task's ID was accepted as this task's latest success;
missing identities and invalid creation times were also accepted. Native WebMCP confirmed the mismatched
record suppressed the expected unavailable-history disclosure.

Before: `/tmp/ax-history-latest-before.log` (4 failed / 37 passed) and
`/tmp/ax-history-latest-native-before-20261020/` (unavailable disclosure assertion failed).

The sidebar now calls the same run parser as the history dialog before deriving status/error. Unknown,
malformed or mismatched records project unavailable and clear stale task errors. A genuinely empty array
still leaves a task with no prior execution idle. Existing parallel-project tests now use realistic run IDs;
status-only test doubles no longer masquerade as complete runtime records.

## Verification

- Full UI: 559 files / 3,741 tests passed, `/tmp/ax-history-latest-ui.log`.
- Build (including UI typecheck) and lint passed: `/tmp/ax-history-latest-build.log`,
  `/tmp/ax-history-latest-lint.log`.
- Native foreign-history mode passed unavailable disclosure, history retry recovery, multi-slot editing,
  UTC/DST checks, CSP and renderer validation: `/tmp/ax-history-latest-native-final.log`,
  `/tmp/ax-history-latest-native-final-20261020/`. The narrow history disclosure screenshot was inspected.
- Broader Settings regression passed: `/tmp/ax-settings-recheck-20261020.log`,
  `/tmp/ax-settings-recheck-20261020/`. It inventories 15 pages and 616 rendered control observations
  (not unique controls), with 65 recorded native click/fill actions. Option selection, numeric edit/reset,
  reversible preferences, shortcut paging/search/focus, Hooks error/retry, preload, CSP and renderer checks passed.
- Visually inspected Settings `shortcuts-narrow-light.png` and `shortcuts-dark.png`: labels and shortcut fields
  remain readable with clear focus and disabled states. External login, downloads, OS dialogs, destructive actions
  and every nested editor are not qualified by this Settings recheck.

## Scope

This is consumer validation of project/task-scoped history. It does not claim the runtime produced a wrong
identity in normal operation or qualify provider/MCP concurrency. The fixture deliberately supplies one
foreign task identity; the error/retry, multi-slot and DST journeys remain part of its native regression.
