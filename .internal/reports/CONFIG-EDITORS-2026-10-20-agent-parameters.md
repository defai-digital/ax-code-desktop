# Agent parameter controls and narrow layout

[Plan](../plans/PLAN-2026-10-20-agent-parameter-controls.md).

## Findings

Native WebMCP inventory exposed Temperature and Top P under identical placeholder names (`—`) and duplicate generic increment/decrement names. The existing NumberInput already derives field-specific button labels when callers provide an aria-label; this form did not supply one.

At an 800px viewport, the Agents editor's identity, model and numeric rows used desktop horizontal layouts despite a narrow third column. Native screenshot `/tmp/ax-agent-fields-before-20261020/pages/agent-editor-narrow.png` showed labels with their controls clipped off the right side. The new bounds assertion failed against the prior build (`/tmp/ax-agent-fields-before-20261020.log`).

## Repair

- Pass existing translated Temperature and Top P labels into NumberInput and the existing Override Model label into the model picker. Selected model text remains in its accessible name.
- Use the actual editor container width for identity, model and numeric row layout; wrap name/scope and parameter controls when needed.
- Remove the now-unused device-width hook. Unrelated permission-editor layout remains unchanged.

## Verification

- Focused agent/editor regressions: 15 tests passed (`/tmp/ax-agent-fields-tests.log`).
- UI type checking and workspace lint passed (`/tmp/ax-agent-fields-typecheck.log`, `/tmp/ax-agent-fields-lint.log`).
- Native journey extends the prior scope/picker/validation checks with numeric increment, decrement, direct input and blur commit, upper-bound clamp, disabled increment at the maximum, clearing both overrides and clean-state restoration.
- Narrow checks cover eight controls: name, model, two numeric fields and their four stepper buttons. They check horizontal bounds; vertical scrolling remains expected.

- Desktop build passed (`/tmp/ax-agent-fields-build.log`). Final native journey passed (`/tmp/ax-agent-fields-verified-20261020.log`), including preload, CSP and renderer error checks.
- Visually inspected final `pages/agent-parameters-narrow.png`: name, scope, model, numeric fields and steppers are inside the editor, with readable stacked labels. The same view previously showed labels alone.
- Source-text test ratchet and final harness lint passed; no new source-text assertions.

## Focus qualification discovered during testing

The first numeric run failed the Top P maximum check. A diagnostic run confirmed activeElement moved from Top P to Temperature while the displayed value remained 2 (`/tmp/ax-agent-fields-focus-debug-20261020.log`). Bringing the test window to the front produced document.hasFocus() true and the expected clamp to 1 (`/tmp/ax-agent-fields-focused-20261020.log`); the entire journey passed. The final journey brings its isolated window forward and verifies document focus before testing blur. No NumberInput validation implementation was changed, and the earlier failure is not counted as a numeric clamp defect. This prerequisite is documented in `docs/development-webmcp.md`.

This remains a fixture-backed development check, not real agent execution, persistence or provider parameter qualification.
