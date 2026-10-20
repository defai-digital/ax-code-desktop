# Configuration editor scope display

[Implementation plan](../plans/PLAN-2026-10-20-editor-scope-labels.md).

## Defect and repair

Commands and Agents new-draft scope selectors rendered raw `user`/`project` values although their menu options used translated Global/Project labels. The shared SelectValue intentionally falls back to the raw value when callers provide no children. These two forms now explicitly render their existing translated scope labels. Stored values, option values and write contracts are unchanged; the shared Select component was not modified.

## Before repair

- Four mounted regressions failed: both scope values in both forms (`/tmp/ax-editor-scope-unit-before.log`: 4 failed, 11 passed).
- Native WebMCP could not discover a Global scope trigger (`/tmp/ax-editor-scope-before-20261020.log`: Missing UI control: Global). The previous screenshot showed `user` in the scope field.

## Verification

- Focused mounted/regression suite: 22 tests passed (`/tmp/ax-editor-scope-unit-after.log`).
- UI type checking passed (`/tmp/ax-editor-scope-typecheck.log`).
- Workspace lint and full boundary checks passed (`/tmp/ax-editor-scope-lint.log`, `/tmp/ax-editor-scope-boundaries.log`).
- The native configuration editor journey now switches Global to Project and back in both forms, checks rendered labels and clean state, and captures the result. It still submits no valid save.

- Final Desktop build passed (`/tmp/ax-editor-scope-build.log`).
- Native journey passed (`/tmp/ax-editor-scope-native-verified-20261020.log`): Commands and Agents switch Global → Project → Global, preserve clean state, and retain the earlier picker, validation and narrow-layout checks. Preload, CSP and renderer error checks passed.
- Visually inspected `pages/agent-editor-scope.png` and `pages/command-editor-narrow.png`: Global is rendered clearly in both forms, including the narrow Commands editor.
- An intermediate native run used an unscoped first-combobox assertion and timed out despite the screenshot showing Project correctly. Scoped the assertion to the Settings select trigger and reran successfully; no product change was made in response to that harness issue.

These checks do not qualify real runtime persistence, Agents narrow layout, or every other SelectValue consumer.
