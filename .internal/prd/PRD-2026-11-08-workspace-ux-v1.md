# Workspace UX v1

Status: Authorized for planning and implementation by the user's 2026-11-08 instruction following the UI/UX review.
Extends Supervision Usability v1 and Parallel Project Supervision UX v1. No runtime or source-ownership boundary changes.

## Evidence and intent

The source and isolated native UI review found a 279px conversation column at a 1280px viewport when both right surfaces
were open, Projects below an 800px viewport after nine starter suggestions, mixed navigation levels, overflowing inspector
tabs, and multi-line directory prefixes dominating same-name project fixtures. These are fixture observations, not user-study
results. Runtime `retry` is currently projected as `running`; the display should retain the runtime distinction.

References reviewed on 2026-11-08:
- https://linear.app/changelog/2026-03-12-ui-refresh
- https://www.nngroup.com/articles/state-of-ux-2026/
- https://developer.apple.com/design/human-interface-guidelines/materials

## Requirements

1. The secondary inspector and project sidebar must not compete for width. Opening an inspector reveals it and closes
   the project sidebar; opening the project sidebar suspends the inspector without unmounting its editor or discarding drafts.
   Both sidebars must honor the system reduced-motion preference.
2. Every inspector uses its full content width in a narrow workspace. A labeled return action restores the conversation,
   through the existing Files unsaved-changes guard. At wider widths, an explicit focus toggle expands the inspector.
3. Primary navigation distinguishes Workspace and Portfolio (the existing Mission Control). Session grid is a view option;
   Review changes remains a labeled contextual action. This refines requirement 3 of Supervision Usability v1 without
   removing any destination, keyboard shortcut, pop-out, request action or comparison.
4. Keep the composer anchored before incoming decisions. Show projects before starter suggestions; show three starters
   initially with an explicit disclosure for the rest. Retain pinning, project starters, reordering and custom commands.
5. Bound sidebar identity text while retaining a visible, distinguishing project/directory suffix, full accessible action
   identity and complete path disclosure. Same-name project identities must not become indistinguishable.
6. Show retrying only from a runtime-reported retry, without changing urgency, decision counts or canonical execution state.

## Acceptance

Behavior tests cover navigation and rejected guards, draft/editor preservation, starter disclosure and group operations,
identity collisions and retry precedence. Native WebMCP verifies fresh state and screenshots in light/dark at 1280 and
800 CSS pixels, including multiple projects, panel handoffs, focus/return and starter expansion. A 600px rendering stress
case is supplementary; it does not change the native minimum window size. No live model calls are required.
