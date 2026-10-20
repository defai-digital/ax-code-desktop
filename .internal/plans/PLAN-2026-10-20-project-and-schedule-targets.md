# Distinct project and scheduled-task targets

Status: Authorized GUI defect investigation and repair. Baseline: `3c9fe8d2`.
Related: reference-informed supervision RS-01/RS-04/RS-10 and parallel-project acceptance scenarios.

Source leads: project headers hide their paths in tooltips and place sortable button attributes on a non-action
wrapper. Scheduled rows use task-title-only action names and project-label-only context, including their project picker.
Two projects with the same displayed label and same task title may therefore expose indistinguishable targets.

1. Add mounted reproductions with actual project-header controls and the scheduled list. Verify action uniqueness,
   visible project context and exact editor/toggle destinations before changing production code.
2. Detect collisions using the labels actually rendered by the sidebar, including normalized default names. Show path
   context for collisions, retain concise unique labels, and preserve project IDs and canonical task directory routing.
3. Move sortable attributes onto the real project-header button, retaining keyboard/pointer sorting. Contextualize
   scheduled action names when the same task title appears in another project. Include context in its project picker.
4. Extend the isolated native two-project journey with same-name scheduled definitions and independently different
   prompts. Open/cancel both editors and inspect their prompt/directory context. Exercise project collapse through real
   native controls, inspect populated narrow/light/dark screenshots, and assert that no scheduled writes occurred.
5. Verify scoped fixture reads, focused UI tests, typecheck, lint/build and existing native journeys. Record findings,
   limitations and bounded reviewer receipts, then commit only this repair.

The journey verifies GUI selection using fixtures. It does not run a provider, schedule occurrence, or external MCP tool,
and it does not qualify concurrent execution. No new runtime contract, release or permission is introduced.

The first post-repair screenshot also reproduced Projects Home's heading overlapping its unwrapped toolbar at 800 CSS
pixels with the sidebar open. Extend this repair to wrap that existing toolbar according to its container width; add
rendered bounds checks and repeat the populated screenshot. This visual defect is independent of directory selection.
