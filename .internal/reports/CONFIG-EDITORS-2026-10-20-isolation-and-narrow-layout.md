# Configuration editor isolation and narrow layout

Plan: [Agent save isolation](../plans/PLAN-2026-10-20-agent-save-isolation.md).

## Confirmed and repaired

1. Agent save completion was scoped only by name. Mounted tests failed for cross-project same-name updates, leaving and returning to a form, and creation completing after a different project's draft opened. Added a form generation keyed by project, selection, draft and mount lifetime. Permission normalization and same-form edits remain unchanged.
2. Native WebMCP exposed both Commands execution selectors as `Not selected`, without their visible field labels. Optional localized labels now distinguish agent and model while retaining their selected values. Other consumers keep existing names.
3. Native screenshot review at 800px revealed clipped command name, agent and model controls. Viewport breakpoints enabled horizontal form rows despite a narrow editor pane. The form now uses its container width and wraps the name/scope row. Root overflow alone did not detect this defect; the new journey checks affected control bounds.

## Evidence

- Before Agent repair: `/tmp/ax-agent-save-before.log`, 3 failed / 2 passed mounted tests.
- Initial native inventory: `/tmp/ax-command-editor-explore-20261020/editor.json`, two same-name selector buttons. An earlier exploratory run had a script quoting error; that was corrected before collecting this evidence and is not a product defect.
- Initial native screenshot: `/tmp/ax-config-editors-native-20261020/pages/command-editor-narrow.png`, controls clipped despite the then-green outer overflow assertion.
- Added bounds assertion failed against the pre-layout-fix build: `/tmp/ax-config-editors-narrow-before-20261020.log`.
- Final build and native journey passed: `/tmp/ax-config-editors-build-final.log`, `/tmp/ax-config-editors-native-final-20261020.log`.
- Visually inspected final `pages/command-editor-narrow.png`: command name, scope and both execution selectors are visible inside the editor, with labels above controls. The template area remains vertically scrollable. The transient validation toast is visible at the lower edge; inline validation and scope display wording remain candidates for further review.

Reproduction command after build:

```sh
node desktop/packages/electron/scripts/e2e/config-editors-webmcp.mjs --artifacts /tmp/config-editors
```

The native journey discovers each selector by its distinct name, opens both pickers, selects no override, exercises required-template validation, fills and reads back the template, restores the draft to clean state, and checks narrow control bounds. It submits no valid configuration save and uses the isolated stub/profile. It does not qualify real persistence or native cross-project timing.

## Tests and review

- Full UI suite: 561 files / 3,751 tests passed (`/tmp/ax-agent-save-ui.log`) before the CSS-only layout adjustment and final extra review regression.
- Final focused suite: 18 tests passed, including a new same-form create with list refresh before resolution (`/tmp/ax-config-editors-focused-review.log`).
- UI type checking, final Desktop build, workspace lint and source-text test ratchet passed. No new source-text assertions.
- [Grok/Muse receipts and disposition](../reviews/config-editors-2026-10-20/README.md): Muse completed; Grok timed out without substantive output. No reviewer output substitutes for native or behavioral evidence.

No runtime, SDK, permissions policy, dependency, release identity or persisted data format change. Unrelated runtime-pin/test edits and the reference symlink remain outside this commit.
