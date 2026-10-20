# Desktop UI WebMCP development surface v3

Status: Implementation contract for the user-authorized development UI testing/repair continuation, 2026-10-20.
Extends [v2](SPEC-2026-10-20-desktop-ui-webmcp-v2.md), preserving its original record, tools and authority boundaries.
Reproduction: [numeric focus qualification plan](../plans/PLAN-2026-10-20-numeric-focus-qualification.md).

## Document focus observation

Every snapshot includes `documentFocused: boolean`, evaluated from that snapshot's document.hasFocus(). This applies
to ax_desktop_get_ui_state, pagination and the ui member of successful click/fill responses. It is an additive field; existing
tool names, inputs, control references, paging, sensitive-field restrictions and size bounds are unchanged.

The boolean describes document focus at observation time, not focus ownership for an entire multi-call sequence or an
individual control. It is not OS activation authority, user consent or evidence of blur delivery. A caller qualifying
focus/blur behavior must observe true, execute the action and independently check events/effects. Refresh observations
after native-window changes. activeElement alone does not establish that a background document delivered focus events.

The provider still uses normal focus/click/input handlers; it neither activates native windows nor clamps input drafts.
Background actions remain available within existing restrictions. A returned action acknowledgement cannot qualify
foreground interactions when documentFocused is false. The isolated diagnostic may invoke the existing native main-window
focus command for setup/restoration; that IPC is not added to any WebMCP tool input or capability.

## Verification

Unit coverage observes false and true values on reads and action responses without echoing input values. Native coverage
compares the field with independent DOM reads in an unsaved numeric draft before/after an isolated pop-out owns focus,
checks actual focusout delivery and maximum clamp in the foreground, and restores clean state without saving.
Keep prior snapshots/controls and packaged-off opt-in regressions intact. This extension does not qualify headless,
live provider, external dialog, installed application or signed-package behavior.
