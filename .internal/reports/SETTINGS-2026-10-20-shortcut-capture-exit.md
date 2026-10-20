# Shortcut capture exit and keyboard navigation

[Plan](../plans/PLAN-2026-10-20-shortcut-capture-exit.md). Baseline: `f34c52ed`.

## Reproduced behavior

The baseline full Settings WebMCP audit passed all 15 tabs and 616 control observations
(`/tmp/ax-settings-refresh-20261020.log`). It covered shortcut focus/search but did not deliver shortcut keys.

Deeper mounted tests failed four cases (2 passed) in `/tmp/ax-shortcut-exit-before.log`: Escape did not release subsequent
Tab, a completed chord still allowed Tab/Shift+Tab to overwrite its draft, clicking the focused field did not rearm the
indicator, and an IME process key was recorded. The original handler cleared the capture indicator but ignored capture
state on later keydown events.

Native reproduction: `/tmp/ax-shortcut-exit-native-before-20261020.log`. WebMCP focused the real field; CDP delivered
Escape and Tab. `after-escape-tab.json` and its screenshot show the original binding replaced by an unsaved Tab draft,
Save enabled and focus still in the recorder. No shortcut was persisted by that negative run.

## Repair and retained behavior

Capture now runs only while armed. Escape or a completed chord disarms it, allowing native Tab/Shift+Tab focus movement
without changing the draft. Click, Enter and Space can rearm the focused field. Explicitly armed Tab capture and its
existing conflict/overwrite flow remain supported. Composition events do not become shortcuts.

Released key events stop propagation to application bindings while preserving the browser default. A regression caught
that distinction in an early repair candidate (`/tmp/ax-shortcut-exit-global-before.log`, 1 failed/6 passed). The final
native case saves Tab for the command palette, confirms the conflict clears Cycle agent, verifies released Tab navigates
without opening that palette, and resets both mappings to the initial empty override set.

An older mounted test focused and typed inside one React batch. It now uses separate event boundaries, matching browser
delivery; its persistence/draft assertions remain. The first post-repair native driver expected different Save label
capitalization. It now discovers the actual row names from a fresh snapshot; that setup failure is not a product defect.

## Final evidence

- Seven focused tests passed (`/tmp/ax-shortcut-exit-unit-final.log`).
- Full UI suite passed: 565 files, 3,778 tests (`/tmp/ax-shortcut-exit-full-ui-final.log`).
- UI typecheck, Desktop build and lint passed (`/tmp/ax-shortcut-exit-typecheck-final.log`,
  `/tmp/ax-shortcut-exit-build-final.log`, `/tmp/ax-shortcut-exit-lint-final.log`).
- Native capture/save/reload/reset/conflict journey passed (`/tmp/ax-shortcut-exit-native-final-20261020.log`). Its bounded
  `shortcut-receipt.json` records observed chords, saved/overwritten maps, final restoration, native actions and key events.
- Inspected the negative screenshot and final `pages/global-tab-navigation.png`: focus leaves the recorder, the saved
  Tab binding stays unchanged and no command palette obscures Settings.
- Locale check passed (14 locales, 4,932 keys, 64,116 entries); all boundary/ownership, SDK/runtime-pin and release-identity
  source checks passed (`/tmp/ax-shortcut-exit-locales-final.log`, `/tmp/ax-shortcut-exit-boundaries-final.log`).

- Two complete post-repair Settings audits passed, each with 15 tabs and 616 control observations
  (`/tmp/ax-shortcut-settings-pass1-20261020.log`, `/tmp/ax-shortcut-settings-pass2-20261020.log`). They also cover
  light/dark/narrow rendering, preference restoration, shortcut search/paging and malformed Hooks retry.
- Nested command/agent validation, parameter steps/clamp/clear, scope labels and narrow bounds passed in
  `/tmp/ax-shortcut-config-focused-20261020.log`.

- The revised close/reload/reopen keyboard journey passed twice consecutively
  (`/tmp/ax-shortcut-capture-verified2-20261020.log`, `/tmp/ax-shortcut-capture-verified3-20261020.log`). Both retain the
  conflict/overwrite and persisted reset assertions. The original final-build keyboard run above also passed.
- Default native regression passed all 10 checks (`/tmp/ax-shortcut-default-regression-20261020.log`), including settings
  keyboard access, pop-out singleton, reload, approvals and goal/session isolation.
- Inspected final `pages/shortcuts-narrow-light.png` from Settings pass 2 and `pages/shortcut-restored.png` from the second
  revised keyboard run. Fields, search/count and row actions remain readable; the default chord and disabled clean-state
  Save/Reset controls are restored.
- Final driver lint passed (`/tmp/ax-shortcut-exit-harness-lint-final.log`); `git diff --check` passed.

An exploratory repeat tried to open Settings while its restored page was still mounting, so the background Settings
button was unavailable (`/tmp/ax-shortcut-capture-pass2-20261020.log`). The persistence journey now explicitly closes
Settings, reloads, discovers its visible control and reopens the page. This avoids using a transient missing search field
as evidence that the dialog is closed. The saved-file and field read-back assertions remain unchanged.

The first nested-editor regression failed the Top P blur-clamp check
(`/tmp/ax-shortcut-config-regression-20261020.log`). The separate Agent parameter report already identified foreground
focus as a prerequisite. The driver now re-establishes and records it before each numeric blur sequence and emits
focused/value/active-element diagnostics on clamp failure. The focused run passed with the same clamp assertion and no
NumberInput implementation change (`/tmp/ax-shortcut-config-focused-20261020.log`, `numeric-focus.json`). Both recorded
pre/post focus values were true; the earlier run lacked that telemetry, so its precise cause remains unproven. Retain it
as a harness-stability lead rather than count it as a numeric product defect or silently erase the failure.

## Scope

Control discovery, focus, search, save, reset and overwrite use native WebMCP. Key events use CDP because the development
adapter has no generic keypress tool. No JavaScript state mutation or direct runtime save substitutes for those actions.
Composition is covered by mounted events, not an operating-system IME session.

The journey uses its own profile/stub runtime, foregrounds only the test window and restores its shortcut overrides.
External login/download, native dialogs, real user resources and live scheduling are not qualified here. No runtime
permissions, budgets, pins or public release state changes are made.

[Review receipts](../reviews/shortcut-capture-2026-10-20/README.md): Muse and Grok each timed out without substantive
output. No completed review or approval was obtained for this diff; independent mounted/native evidence supports it.
