# Configuration feedback, dismissal and native observation

Date: 2026-10-20. Baseline `ca1a598b`. Local implementation and verification only; no push, package or release.
See [plan](../plans/PLAN-2026-10-20-config-update-observation.md),
[v4 additive contract](../spec/SPEC-2026-10-20-desktop-ui-webmcp-v4.md),
[bounded receipt](SETTINGS-2026-10-20-config-update-evidence.json) and
[review disposition](../reviews/config-feedback-2026-10-20/README.md).

## Confirmed defects

1. Every `startConfigUpdate` showed "AX Code is restarting", including a pending HTTP write before its response and
   fixture operations eventually acknowledged with `requiresReload: false`. The wait hint also promised automatic
   resumption. The header/hint now describe a configuration operation without inventing a runtime phase. Existing
   operation details remain available.
2. Timeout Dismiss invoked `finishConfigUpdate`, consuming an operation's pending count. With two operations active,
   dismissal plus the first real completion made the global state idle while the second operation was still pending.
   Dismiss now hides presentation only. An in-memory `batchId` changes when the count moves from zero to nonzero;
   local dismissed/timed-out ids distinguish a new cohort even if completion/start happen in one React batch. Actual
   owners retain completion responsibility. The existing 120-second timeout and explicit Reload app action remain.

The initial corrected-header screenshots also showed a white mark washed out on light backgrounds and form text
visible behind the progress copy. An opaque bordered card and local light-theme inversion make the notice readable.
The asset and global icon component are unchanged.

## WebMCP observation

Snapshots add `configurationOverlayVisible` for reads, paging and action responses. It observes visible dedicated
Desktop overlay markup without copying its message, pending count, batch id or input values. Tools, input schemas,
ref lifetime, paging, sensitive-field restrictions, abort handling and packaged-off/opt-in gates stay intact.

This reports presentation, not runtime restart, actual completion, cancellation, permission or general occlusion.
Dismissed presentation can report false while operations remain pending. Existing semantic handlers remain available
behind a notice: a successful fill there does not qualify physical pointer access. Native tests make that distinction
explicit rather than interpreting the returned acknowledgement as visible interaction. Original v1-v3 records remain.

## Causal evidence

- `/tmp/ax-config-feedback-negative2-20261020.log`: 4 mounted tests, 2 failures before repair. One proves false restart
  copy; the other directly asserts that an operation must remain pending after Dismiss and the first real completion.
  The first negative attempt checked presentation hiding before the counter assertion; the revised order establishes
  ownership failure directly.
- `/tmp/ax-config-feedback-native-negative2-20261020/`: 7 recorded audit actions, one pending fixture PATCH, old restart
  copy and center-hit evidence of the blocking notice. The added metadata is absent in that baseline. The earlier
  `native-negative` run stopped on missing idle metadata before a write, so it is not restart-copy causal evidence.
- Intermediate native `fixed1`/`fixed2` passed behavior but prompted the additional card/mark contrast improvement.
  They are not the final visual candidate.
- Native `final1`/`final2` both pass on the final build: each has 15 recorded audit actions plus one direct native fill,
  three PATCHes (accepted, rejected, retried), and seven independent observations. Flags follow true/false through
  each response; the direct fill also requires true in its action snapshot while the notice physically covers center.
  Native flags agree with independent DOM, owned markup and center hit testing. The retry retains newer unsaved edits.
- All configuration HTTP methods are intercepted before opening MCP. Only disabled remote project fixtures using
  `.invalid` URLs and OAuth off may mutate. Responses remain in memory; no request continues to the real writer.

## Verification and visual review

- Focused mounted/provider tests: 21 passed. Covers counter ownership, cohort reset in one React batch, full timeout,
  unmount timer cleanup, hidden markup, metadata on reads/paging/click/fill, privacy and existing provider restrictions.
- Final full UI: 569 files, 3,815 tests passed with `--maxWorkers=4`; assertions and timeout limits are unchanged.
- Final build, separate UI typecheck, focused ESLint, boundary/source-text and release identity checks passed.
  Identity remains app 7.27.3 / SDK 2.6.37 / existing user runtime pin 7.27.7; that pin is not part of this patch.
- Locale validation: 14 locales, 4,942 keys, 64,246 translated entries. Both new header/hint keys have translations;
  historical restart keys are preserved rather than silently reused with different semantics.
- Final native regression terminal receipts are recorded in `/tmp/ax-config-feedback-regressions-20261020.json` and
  corresponding logs; the machine receipt contains their completed results.
- Actual final wide dark and narrow light/dark screenshots were inspected: text has a solid card background, the mark
  is visible in light mode and content stays within the viewport.
  This is visual inspection, not a screen-reader or physical-mobile qualification.

## Review and limits

Muse completed in 38.9 seconds. Grok timed out after 90.3 seconds with no usable review; no approval is inferred.
The concrete source and each lead were independently checked. Prior five-model create-edit reviews are linked with
their original scope, not reused as approval of this diff.

Presentation state/deadlines are component-lifetime state, not persistent operation history. Desktop does not remount
this component on project/Settings changes; a document/App recovery may show it again. Anonymous start/finish messages
still retain the latest detail, not per-operation ownership. Dismiss hides the current overlapping cohort until it ends;
it does not change pending counts, cancel requests or suppress a fresh cohort after all current work completes.

Timeout Dismiss ownership is qualified with mounted fake timers, not an actual native 120-second dismissal. Explicit
Reload app, live worker restart, server recovery, disk writes, MCP/OAuth, keyboard focus containment, inert background,
screen readers and physical pointer access through the overlay are not qualified here. Stale sidebar inventory/deletion
and overlay keyboard handling remain subsequent populated cases; the broader audit stays active. All unrelated dirty
files and the reference symlink are preserved.
