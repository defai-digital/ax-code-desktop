# Agent parameter control usability

Status: bounded Settings quality repair.

Native control inventory exposes both Temperature and Top P as `—`, with duplicate Increase/Decrease value buttons. The visible labels are not associated with the numeric controls. The Agents editor also retains viewport-based horizontal rows, the pattern that clipped Commands controls in a narrow Settings pane.

1. Extend the native journey to capture and assert agent name and numeric input bounds at 800px before changing layout.
2. Pass existing translated field labels to NumberInput so its existing accessible stepper naming is specific. Label the model picker with its existing visible field label.
3. Base identity/model/numeric rows on editor container width and wrap the name/scope row. Keep unrelated permission-editor behavior unchanged.
4. Through WebMCP, exercise numeric steps, direct fill, clear, clean-state restoration, and narrow bounds; inspect screenshots. Run UI type checking, focused tests, lint and build, then commit scoped files and evidence.
