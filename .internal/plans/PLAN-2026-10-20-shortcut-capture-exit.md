# Shortcut capture exit and keyboard navigation

Status: Authorized existing Settings defect investigation and repair. Baseline: `f34c52ed`.
Related: WebMCP Settings Phase A, reference-informed supervision RS-10.

The complete native Settings audit passed at the baseline (15 tabs, 616 control observations). Source inspection found
that shortcut input key handlers ignore capture state: Escape and a completed chord clear the indicator, but subsequent
Tab is still prevented and recorded as another draft. This can trap keyboard users and overwrite the intended chord.

1. Reproduce after Escape and after a completed chord with mounted cancelable keyboard events. Check persistence is
   untouched and the draft remains unchanged. Preserve explicit capture of Tab, which is already a supported binding.
2. Honor capture state. Let Tab/Shift+Tab navigate after capture ends; allow explicit pointer/keyboard rearming while
   retaining focus. Ignore composition events rather than recording an IME process key as a shortcut.
   Stop shortcut events from reaching global application bindings while preserving the browser's default Tab navigation.
3. Verify in the built Electron UI: native WebMCP discovers/focuses the field and exercises ordinary save/reset controls;
   CDP delivers physical keyboard events because the development adapter has no keypress tool. Observe focus, draft,
   persistence/reload and restored state independently. This does not add a generic key tool to WebMCP.
4. Repeat complete Settings and nested-editor checks, inspect screenshots and run focused UI tests, typecheck, lint/build
   and relevant native regressions. Record exact coverage and limitations, then commit only this repair and its evidence.

No shortcut dispatch/runtime ownership, public release, permission or real-user profile changes are introduced. Native
keyboard tests use the isolated profile and foreground only that test window when focus/blur delivery requires it.
