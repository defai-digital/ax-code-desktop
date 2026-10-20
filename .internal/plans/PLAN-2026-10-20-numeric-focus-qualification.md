# Numeric focus qualification

Date: 2026-10-20. Baseline `bdc1a4bd`. Authorized continuation of the native WebMCP Settings audit.

Earlier Agent parameter journeys sometimes observed Top P remaining 2 after changing activeElement. Foreground runs
clamped to 1. Their receipts did not establish every failing run's document focus or event delivery. Do not infer a
numeric validation defect, or dismiss one, from those incomplete observations.

1. Use the isolated built app and an unsaved agent draft. Observe focus/blur events on Temperature and Top P without
   altering handlers, input values or application state through JavaScript.
2. Compare native WebMCP fill/click while the main window is foreground with the same operations while an isolated
   supervision window owns focus. Verify document.hasFocus independently. Restore foreground and observe actual blur
   and numeric read-back. Never clamp values in the driver or relax the maximum assertion.
3. Record actual behavior, including if background native actions restore focus. Check numeric bounds, clear overrides
   and clean-state restoration without a valid save. Inspect the rendered controls/screenshot.
4. Fix a confirmed product or harness defect only after the controlled comparison. Run relevant focused tests and repeat
   the scoped journey. Commit the diagnostic/repair and evidence without touching user data, pins or unrelated files.

This diagnostic cannot retroactively establish the cause of a historical failure without telemetry, and does not qualify
provider parameter persistence or actual model execution. Its purpose is to resolve the reproducible focus mechanism.

Controlled evidence: background native fill/click changes activeElement with no blur/focusout and leaves Top P at 2;
foreground repeats clamp to 1. Existing UI snapshots omit document focus, so a WebMCP-only caller cannot see this
prerequisite. Add a backward-compatible documentFocused boolean to snapshots and action read-back, with a versioned
v3 development spec, unit negative/control checks and native agreement with document.hasFocus. Do not force native
activation, refuse unrelated background actions or normalize numeric drafts in the provider.
