# Desktop UI WebMCP development surface v4

Status: Implementation contract for the user-authorized configuration-feedback UI audit continuation, 2026-10-20.
Extends [v3](SPEC-2026-10-20-desktop-ui-webmcp-v3.md); original v1-v3 records and authority boundaries remain intact.
Related [plan](../plans/PLAN-2026-10-20-config-update-observation.md).

## Configuration overlay observation

Every snapshot adds `configurationOverlayVisible: boolean`. This covers reads, pagination and the `ui` of successful
click/fill responses. The value observes a rendered, layout-visible `[data-config-update-overlay]` element owned by
Desktop's configuration feedback component. It does not expose the operation message, input values, credentials,
pending counter or presentation batch id.

The boolean reports presentation at observation time, not actual runtime restart, durable work state, successful save,
permission, cancellation or complete occlusion of every control. A dismissed overlay reports false even while an
operation remains pending. Other popups/overlays do not imply this flag. Refresh observations after async transitions.

Existing synthetic semantic actions remain available under the existing restrictions; they do not establish physical
pointer access through the overlay. A caller qualifying visible interaction must check the flag and independently
inspect actual DOM/hit testing or screenshots. A true flag is a reason to distinguish handler/state tests from physical
visibility claims, not permission to bypass policy or expand tool authority. This change adds no new tool or input,
does not activate windows and preserves refs, paging, credential checks, opt-in/unpackaged gates and abort cleanup.

## Verification

Unit tests observe true/false on reads, paging, fill/click responses and hidden overlay markup without copying message
or input text into snapshots. Mounted tests cover truthful generic feedback, timeout dismissal without consuming
overlapping operations, a fresh presentation cohort in a single React batch, and timer cleanup on unmount. Native
coverage compares the flag with independent overlay DOM/hit testing during delayed config responses and after accepted
and rejected writes. The development fixture never continues writes to the real configuration writer.

The configuration feedback header is intentionally neutral. The existing callback contract does not identify precise
runtime phases for every operation. Presentation dismissal cannot complete or cancel an operation; the in-memory
cohort id only determines whether a notice has been dismissed or timed out. Neither is a runtime lifecycle contract.
