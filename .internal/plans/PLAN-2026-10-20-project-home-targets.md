# Projects Home identity and actions

Status: Authorized defect investigation and repair. Baseline: `e6eceea2`.
Related: reference-informed supervision RS-01/RS-04/RS-10 and the preceding sidebar/schedule identity repairs.

Source leads: Projects Home cards expose title-only accessible names, truncate the differentiating path suffix, and
give every pin/new-session control the same name. The compact attention control has no visible label. Reproduce these
through mounted tools and an isolated two-project native WebMCP journey before changing production code.

1. Exercise actual card, pin, new-session and attention handlers in mounted tests. Verify the exact project/session
   destination and that child actions do not also open the parent card. Include compact and duplicate displayed-title cases.
2. Compare the Home titles actually displayed, preserving custom spelling and translated Home fallback. Add path context
   to colliding card names, keep differentiating paths readable, and contextualize child actions for every project.
   Expose the active project through an accessible current-state attribute.
3. Native verification uses the existing isolated two-project scenario. Discover fresh targets, select each project,
   pin/unpin with state/order read-back, open its draft, and open each attention conversation with distinct fixture text.
   Local preference mutations stay within the temporary profile. No provider or project-file write is needed.
4. Review populated wide/narrow/light/dark screenshots, including paths, row bounds and child-control placement.
   Run focused tests, full UI suite, typecheck, lint/build and existing affected native journeys. Preserve unrelated work.
5. Record advisory reviewer outcomes as available leads, independently verify every accepted finding, and commit this repair.

This repairs Desktop's existing navigation. It does not qualify live concurrent providers, schedule occurrences or recap
generation, and it does not change runtime ownership or the public release surface.
