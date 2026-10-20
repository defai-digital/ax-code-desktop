# Configuration update feedback and WebMCP observation

Date: 2026-10-20. Baseline `ca1a598b`. Authorized Desktop UI audit continuation; existing audit PRD and runtime boundaries
apply. No runtime, SDK, policy, lifecycle authority or permission expansion.

## Confirmed evidence and source leads

Prior native MCP fixture screenshots show "AX Code is restarting" before a pending configuration response, including
operations eventually acknowledged with `requiresReload: false`. The global overlay hides controls physically while
native semantic handlers remain available under the existing WebMCP contract. Rectangle-only visual checks were
rejected and corrected in the creation-continuity report. The overlay's timeout Dismiss currently calls
finishConfigUpdate, apparently consuming another owner's operation count; verify that overlapping operations remain busy.

## Implementation and verification

1. Add mounted negatives for truthful generic update feedback and overlapping timeout dismissal. Dismiss hides the
   current presentation cohort without completing/cancelling operations. A new cohort must show again, including a
   finish/start sequence inside one React batch. Preserve the existing timeout and Reload app behavior.
2. Use a monotonic in-memory cohort id only for presentation lifecycle; keep start/finish callers and ownership intact.
   Do not claim precise runtime phases that the present callbacks do not establish. A neutral update title and wait
   hint apply to writes, reloads and refreshes while the existing operation detail remains visible.
3. Add an opt-in UI WebMCP snapshot boolean for the rendered configuration overlay. Write a versioned additive spec;
   preserve v1-v3, tools, inputs, refs, pagination, credential restrictions, packaged-off gate and synthetic semantics.
   The flag describes observation, not a permission, actual runtime restart, cancellation or complete occlusion model.
4. Build a native delayed configuration fixture: compare the flag with independent DOM/hit testing; check ordinary
   save, rejected save/retry, return to idle, pagination/action snapshots, and visible narrow/light/dark feedback.
   Intercept every configuration HTTP method before opening MCP; no real writer, MCP server or OAuth.
5. Request bounded Grok/Muse advice on the concrete change. Independently verify claims; prior five-model reviews retain
   their original scope and cannot approve this diff. Run focused tests/typecheck/lint, full UI, build/boundaries and
   native regression journeys, inspect actual screenshots, document limitations and commit scoped files.

Actual first-pass screenshots also showed the white mark losing contrast on light backgrounds and underlying form
text showing through behind the status copy. The final visual pass adds an opaque bordered notice card and a local
light-theme inversion for that mark; no global icon/assets change. Rebuild before final screenshots and verification.

The stale sidebar deletion and concurrent OAuth leads remain subsequent populated cases. Preserve unrelated dirty
files/reference symlink; no push, package or release.
