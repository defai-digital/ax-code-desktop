# Match custom patterns to permission capabilities

[Plan](../plans/PLAN-2026-10-20-permission-pattern-capabilities.md).

## Confirmed contract mismatch

The exact public SDK 2.6.37 PermissionConfig type declares codesearch, doom_loop, question, todoread, todowrite, webfetch and websearch as PermissionActionConfig only. The canonical runtime schema matches this restriction. The custom-pattern picker nonetheless offered these fields, allowing the form to construct a pattern map that the contract does not accept.

The native pre-fix run failed because WebFetch was present among custom-pattern options (`/tmp/ax-action-only-before-20261020.log`). A mounted regression independently failed on the same choice (`/tmp/ax-action-only-unit-before.log`: 1 failed, 12 passed). No invalid configuration was written to reproduce this mismatch.

## Repair

- Exclude action-only fields from the custom-pattern picker. Keep their existing wildcard/action controls available, with reset behavior unchanged.
- Preserve pattern-capable standard tools, Default patterns and unknown tools supported by the SDK catchall.
- Check the capability projection exhaustively against declared action-only fields in the pinned SDK. The TypeScript checker resolved ActionOnlyName to exactly the seven fields above; missing or extra projection entries fail compilation on SDK drift.
- No copied runtime schema, sibling source change, runtime/SDK pin update or persisted-format change.

## Verification

- Mounted editor suite: 13 tests passed (`/tmp/ax-action-only-unit-after.log`), including positive Bash/Default choices and absence of unsupported WebFetch.
- UI type checking passed (`/tmp/ax-action-only-typecheck.log`).
- Native journey now checks absence of all seven unsupported choices and edits/resets the ordinary WebFetch action, alongside existing pattern edit/reset and narrow-layout checks.

- Desktop build and repository lint passed (`/tmp/ax-action-only-build.log`, `/tmp/ax-action-only-lint.log`).
- Native WebMCP journey passed on that build (`/tmp/ax-action-only-native-final-20261020.log`): all seven unsupported
  pattern choices absent, ordinary WebFetch action edit/reset clean, and existing pattern/global/narrow regressions passed.
- Inspected `pages/pattern-permission-choices.png` in that artifact directory: Default and Bash remain visible,
  the menu is readable, and action-only fields remain represented by ordinary action rows behind it.

This verifies editor choices and the published type contract; it is not a live runtime rejection or permission enforcement test.
