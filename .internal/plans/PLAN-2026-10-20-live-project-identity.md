# Live sidebar project identity

Status: Authorized defect investigation and repair. Baseline: `aefd9749`.
Related: reference-informed supervision RS-01/RS-04 and the Needs You identity repair.

The last native screenshots showed two identical Live session titles and project labels. Source inspection finds that
the supervision publisher emits a custom label without duplicate-name context, and minimal sidebar rows hide project
context in a tooltip. These findings require rendered reproduction.

1. Extend the isolated two-project native journey to inspect Live row names and visible context, and select each
   conversation through that surface. Record a failing baseline before changing production code.
2. Share the existing Needs You project-label disambiguation with the supervision publisher. Preserve canonical IDs,
   directory routing, state and ordering.
3. Keep cross-project activity context visible in default and minimal sidebar modes, with wrapping for long paths.
   Project-group rows retain their existing compact behavior.
4. Add mounted publisher regressions, retain Needs You regressions, and verify both modes through native WebMCP.
   Inspect light/dark screenshots and row bounds. Run typecheck, lint, build and the existing native journey.
5. Record actual evidence and remaining surfaces, then commit only this repair.

This is an existing GUI projection repair, with no new runtime, schedule or recap contract.

Native inventory also exposed two same-name button actions per Live row: the pointer-only drag wrapper inherits a
button role/tab stop, but clicking it does not select the session. Add a mounted WebMCP reproduction and remove that
misleading wrapper interaction while retaining the pointer drag listener and actual child controls.
Narrow screenshots must explicitly open the responsive sidebar; hidden mounted rows are not visual evidence.
