# Scheduled task UX v2 and Workspace UX completion plan

Branch: feat/workspace-ux-2026. Parent implementation: 728ccf06.

1. Reproduce the Live sidebar regression with resize/click/state timing evidence; add a behavior regression and repair the cause without retrying away a failed user action.
2. Research current primary design/product guidance and audit the existing schedule list, editor, history and runtime contract. Record additive requirements and this plan.
3. Implement loaded-empty guidance, stable timing and discoverable actions; improve editor intent order and schedule confirmation while retaining existing execution semantics.
4. Add behavior regressions, run focused and full root checks, build and qualify the original workspace flows plus scheduled-task flows through native WebMCP. Require repeated identity passes.
5. Record a requirement-by-requirement completion audit and inspect the staged diff. Commit and push the branch, verify the remote revision and clean worktree.

Implementation and qualification are complete: all six root gates, 9,025 passing tests, 13 successful native groups,
three consecutive identity passes, two consecutive populated workspace passes, and identical final/native assets.
See the [completed review and requirement audit](../reports/UX-2026-11-08-scheduled-task-ux-v2.md) and its retained
verification manifest. Delivery uses a normal commit and branch push; merge and release remain outside scope.
