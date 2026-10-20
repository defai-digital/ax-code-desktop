# Needs You project identity repair

Status: Authorized defect investigation and repair within the existing portfolio UI.
Related: parallel-project UX v1 UX-02 and reference-informed supervision RS-01/RS-04.

The current non-request Needs You row hides its project below `sm`. Custom project labels also replace paths completely,
so two projects with the same label and session title can be indistinguishable. These are source findings until the
rendered and native journeys reproduce them.

1. Add an opt-in isolated two-project fixture to the existing Desktop harness, retaining default scenario behavior.
   Give both projects the same label and session title; expose canonical fixture sessions/goals through scoped routes.
2. Reproduce lost context through native WebMCP and independent DOM/screenshot inspection. Exercise actual row navigation.
3. Keep project context visible inside the row at narrow container widths. Disambiguate duplicate labels with their
   directory; use ordinary accessible text and preserve the canonical session/project navigation path.
4. Add mounted regressions for duplicate labels, path fallback and correct selection; test the fixture's directory isolation.
5. Run focused tests, UI typecheck, lint/build and native post-repair checks. Inspect populated narrow/wide screenshots.
   Record the scope and remaining limitations, then commit only this repair.

This does not change execution state, schedule contracts, runtime ownership, permissions or the public release surface.
