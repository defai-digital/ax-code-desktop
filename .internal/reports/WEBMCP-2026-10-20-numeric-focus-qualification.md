# Numeric focus qualification and observable document focus

Date: 2026-10-20. Baseline `bdc1a4bd`.
[Plan](../plans/PLAN-2026-10-20-numeric-focus-qualification.md),
[v3 development contract](../spec/SPEC-2026-10-20-desktop-ui-webmcp-v3.md),
[bounded native evidence](WEBMCP-2026-10-20-numeric-focus-evidence.json).

## Controlled result

An inactive main document accepts the native WebMCP fill/click sequence and changes activeElement from Top P to
Temperature, while no blur/focusout is dispatched for Top P. The out-of-range draft remains 2. With native main-window
focus restored, focusing Top P and then Temperature delivers a real focusout and the existing component clamps to 1.
Foreground fill/click also clamps to 1. Clearing the override restores a clean unsaved agent draft.

This reproduces the focus mechanism behind the earlier ambiguous signature; it does not retroactively prove the cause
of every historical failure without focus/event telemetry. No numeric validation implementation was changed, and no
driver-side normalization or relaxed maximum assertion was introduced.

## Repair

Native UI snapshots previously omitted document focus. A WebMCP-only caller could not observe this prerequisite,
despite seeing active controls and a successful action response. Every snapshot now includes documentFocused from
document.hasFocus, including paginated reads and action read-back. It is an observation, not activation, consent or a
guarantee that a sequence retains focus. Existing tools, inputs, references, privacy bounds and packaged-off gates remain.

The isolated diagnostic compares that field with independent DOM reads and records actual events. The configuration
editor journey activates its own main window through the existing native focus command immediately before numeric
blur checks and verifies both observations. That setup IPC is not exposed through WebMCP. Background actions are not
blocked and the provider does not force native focus.

## Verification and failed setup attempts

- Negative unit regression failed before the repair because documentFocused was undefined; 14 existing provider tests
  passed (`/tmp/ax-numeric-focus-state-negative-20261020.log`).
- Final provider/NumberInput focused suite: 20 passed. Full UI: 567 files, 3,790 tests passed. Build/typecheck, focused
  ESLint and boundary/ownership/runtime-pin/release-identity checks passed. App 7.27.3, SDK 2.6.37, runtime 7.27.7 unchanged.
- Controlled run 1 reproduced background event loss but Page.bringToFront could not restore native main-window focus.
  This failed setup is retained at `/tmp/ax-numeric-focus-control1-20261020/`.
- A later run labeled its phase foreground even though setup had since lost focus. Both the new field and independent
  DOM read were false, with no focusout. It failed the strict clamp check and is retained at
  `/tmp/ax-numeric-focus-verified2-20261020/`. The diagnostic now activates immediately before the foreground comparison
  and fails explicitly if that prerequisite is lost.
- Two consecutive final controlled runs passed: `/tmp/ax-numeric-focus-verified3-20261020.log` and `verified4`. Both
  observed true/2, true/1 after blur, false/2 without blur, true/1 after native refocus, then clean state. The committed
  evidence keeps those bounded synthetic numeric facts and event records without credentials or real user configuration.
- The extended configuration editor regression passed (`/tmp/ax-numeric-focus-config-regression-20261020.log`), including
  actual Temperature/Top P edits, step/clamp/clear and eight narrow control bounds. Native three-tool smoke passed
  (`/tmp/ax-numeric-focus-provider-regression-20261020.log`).
- Complete Settings native audit passed: 15 pages, 616 control observations, including pagination, options, reversible
  preferences and light/dark/narrow checks (`/tmp/ax-numeric-focus-settings-audit-20261020.log`).

Background and restored-control screenshots were inspected. The background draft visibly retains 2; the restored
draft shows its default placeholder. Screenshots remain local under the final run's pages directory. No valid save,
model execution, real provider persistence, installed application or signed-package qualification was performed.

Earlier user-requested Grok/Muse/DeepSeek/GLM/MiniMax advisory inputs are recorded in
[Settings reviews](../reviews/webmcp-settings-2026-10-20/README.md). Their prohibition on driver clamping was retained;
they did not review this final field addition or its screenshots. Native evidence supports the focus conclusion.

Next audit lead: McpPage.handleSave awaits mutations and then updates selection/draft/dirty baseline without an apparent
form-generation guard. Existing runtime-action keys protect other operations. Reproduce same-name cross-project save
completion and create-after-switch before treating this source lead as a confirmed defect. The broader all-controls and
recap investigation remains active; this report does not declare the application bug-free.
