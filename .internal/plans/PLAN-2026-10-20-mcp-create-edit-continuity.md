# MCP creation and continued editing

Date: 2026-10-20. Baseline `f411d50e`. Desktop Settings audit continuation; no runtime/SDK/authentication changes.

1. Reproduce the prior review lead with mounted deferred creation: edit a URL after submit, refresh inventory before
   completion, then acknowledge creation. Check same-name and renamed drafts, unchanged submissions, failure/retry and
   navigation to another form. Do not count source suspicion as a confirmed defect.
2. Reproduce through native WebMCP using disabled remote fixture servers and intercepted configuration HTTP methods.
   No real configuration writer, MCP process, authorization exchange or user file changes are permitted by the fixture.
3. Preserve newer editable values when the created record appears and when the draft transitions to the existing form.
   The acknowledged submitted snapshot becomes the dirty baseline. Creation identity/scope must remain unambiguous;
   late completions must still respect the previous generation isolation repair.
   Show a translated inline unsaved-changes status when newer edits remain in the created record; let the action row
   wrap at narrow widths. A creation success acknowledgement does not imply those later edits were submitted.
4. Ask Grok, Muse and AX Code's DeepSeek/GLM/MiniMax for bounded read-only reviews of the concrete evidence/repair.
   Independently disposition leads; unavailable output is not approval.
5. Inspect sidebar mutation targeting during directory/inventory transitions and record reproducible findings or
   remaining unconfirmed leads. Separate additional repairs if their state contract differs.
6. Run mounted/store regressions, typecheck, focused lint, full UI suite, build and boundary checks. Repeat native
   creation/save journeys, review populated narrow/light/dark screenshots, record evidence and commit scoped files.
   Keep unrelated dirty files and the reference symlink unchanged. No push or release.
