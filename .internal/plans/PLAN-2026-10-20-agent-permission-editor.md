# Agent permission editor usability

Status: bounded repair under the Settings quality requirements.

Native WebMCP reproduced an unnamed reset button after adding a custom rule. Permission selectors also expose repeated Global/Ask values without tool/pattern context.

1. Give global, tool wildcard and pattern selectors localized/contextual accessible names, including their current value.
2. Label both rule reset actions using the existing Reset translation and tool/pattern identity. Preserve permission semantics and persisted contracts.
3. Exercise add, action change, reset, wildcard override and reset in an isolated unsaved agent draft; prove restoration to clean state.
4. Capture narrow layout and repair demonstrated clipping without changing authorization or runtime behavior.
5. Run focused tests/type checking, lint, build, native readback and screenshots. Record evidence and commit scoped files.

The pre-fix native narrow check confirmed the custom-pattern field shrinks to a small pill and Deny is clipped. Stack the custom-rule controls based on editor width; assert the pattern field retains at least 100px and all three action buttons stay within Settings.

The expanded native journey exposed another confirmed defect: a Completed native response carried the snapshot as JSON text, while UiWebMcpClient returned it unchanged. Add bounded JSON decoding and object-shape validation in the native client, with regressions for valid text, malformed text and non-object results. Do not mask errors or replay mutations.
