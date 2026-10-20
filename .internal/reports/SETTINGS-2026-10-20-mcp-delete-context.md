# MCP deletion context, inventory provenance and replacement handoff

Date: 2026-10-20. Baseline `af3a3947`. Local implementation and verification; no push, package or release.
See the [implementation plan](../plans/PLAN-2026-10-20-mcp-delete-context.md),
[machine receipt](SETTINGS-2026-10-20-mcp-delete-evidence.json) and
[bounded reviewer disposition](../reviews/mcp-delete-2026-10-20/README.md).

## Confirmed defects and repair

The baseline native journey held Beta's inventory after switching from Alpha. The project selector showed Beta while
Alpha's sidebar rows and More/Delete controls remained actionable. Confirming the stale row sent DELETE to Beta before
Beta's inventory arrived. The fixture intercepted that request and rejected it with 409; no real configuration was deleted.

Sidebar rows and creation now require inventory provenance matching the selected directory. Loading/unavailable text
and forced retry replace mismatched rows, including user-scoped rows obtained through that project's inventory. The
app-owned browser tools card remains discoverable. The detail loading/error branch also precedes the empty selection
prompt, so it no longer advertises Add while that action is unavailable.

Both deletion callers pass their captured directory and UI selection revision. The store rejects an outdated context
before starting a busy operation or HTTP request. Dialogs, menus and local busy state reset when their editing context
changes; generation guards prevent an older completion from closing or unlocking a newer project's pending deletion.
Sidebar runtime-status refresh has its own directory generation, independent of the selected server.

Selection cleanup now follows the refreshed inventory and checks origin directory, selected name and draft intent.
It preserves a same-name selection in another project, a replacement record and a new explicit draft. The existing
same-context original-record cleanup is retained when the post-delete read fails; that fallback does not certify fresh
inventory contents. Origin requests and mutation feedback remain owned by the issued operation after navigation.

An intermediate candidate preserved a same-name replacement but left the old detail URL on screen. This was reproduced
with the native `--replacement` fixture before committing. A non-persisted selection revision now reloads that form's
fields, clean baseline and transient state. Accepted same-directory project/user scope changes advance the revision
even when the initiating component has gone away. Explicit same-name drafts remain intact; the caller's expected
revision prevents a duplicate handoff. Save also requires its loaded form context to match. This is a UI projection,
not runtime identity, a record version or a new public SDK contract.

## Causal evidence

- `/tmp/ax-mcp-delete-native-negative-20261020.log` and its artifact directory capture the baseline wrong-project DELETE.
- `/tmp/ax-mcp-delete-context-negative-20261020.log`: 8 failures and 4 passes across store/sidebar tests before repair.
  Direct failures cover cross-project selection clearing, replacement/draft clearing, missing expected-directory guard,
  exposed stale rows, old confirmation state and the caller's missing origin argument. The initial late-completion
  sidebar negative failed while reopening the new dialog because old busy/modal state remained; it is not independent
  proof of the later close assertion. Final mounted tests exercise two actually pending deletions and complete Alpha
  before Beta to verify ownership directly in both sidebar and detail.
- `/tmp/ax-mcp-delete-replacement-negative-20261020.log` records the intermediate candidate's stale replacement form.
  It is not attributed to baseline `af3a3947`; the final replacement journey exercises the repaired handoff.
- The obsolete source-string assertion for the old form-key spelling failed after the key became a JSON tuple. It was
  replaced with mounted behavior: revealed environment/header rows become masked again across project, server and
  scope handoff. Pure row-removal tests remain; the source-text ratchet removes that obsolete file entry.

## Verification

- Focused mounted/store/privacy tests: 4 files, 52 tests passed.
- Full UI suite: 570 files, 3,840 tests passed with `--maxWorkers=4`.
- Fresh build, separate UI typecheck, focused ESLint, native-script syntax, boundary/source-text and release identity
  checks passed. SDK/runtime pins and release-related user changes are outside this commit.
- Locale validation: 14 locales, 4,943 keys, 64,259 translated entries. The context-change retry message includes server
  changes as well as project changes in every locale.
- All 8 final native processes completed with exit 0: selected/unselected/replacement variants, MCP save/create,
  configuration feedback, Settings and ordinary desktop journeys. Settings reported 15 pages and 616 rendered control
  observations; this is not a claim that every control was clicked. The machine receipt records terminal results,
  log hashes, scenario details and inspected screenshots.

Independent SDK migration/documentation commits landed during this cycle without changing these MCP sources. The
verification workspace parent is recorded in the receipt; those commits and remaining dirty runtime/release files
are preserved outside the scoped repair. This report does not qualify or claim ownership of that migration.

The native deletion fixture intercepts every MCP configuration HTTP method before opening Settings. Beta's held read
fails with 503, explicit Retry obtains its inventory, and exactly one permitted DELETE targets Beta while Alpha stays
intact in memory. The replacement variant retains the newly revealed user-scope server and verifies its actual detail
input and disabled Save. Disabled remote `.invalid` servers and OAuth-off fixtures never reach real writers or MCP.

Actual final screenshots are inspected for loading/error instructions, project identity, same-name replacement fields
and populated narrow light/dark views. The 800-pixel layout wraps the project path and keeps the visible form readable;
lower form actions require scrolling. These images do not qualify every control as simultaneously visible. Native
WebMCP semantic handlers and fresh DOM/readback qualify the tested state changes, not physical access through overlays.

## Review, remaining leads and cycle boundary

Muse completed in 23.3 seconds. Grok timed out after 90.7 seconds with no usable review. Their prompt covered the
initial delete guards/handlers; the later empty-state and replacement projection extensions were verified independently.
Earlier DeepSeek/GLM/MiniMax records retain their original create-edit scope. No model output is approval of this diff.

Remaining leads include stale same-directory lists after a failed post-delete read, project-identifying late feedback,
overlay keyboard containment and concurrent live OAuth. Runtime idempotency, per-record compare-and-swap, path aliases,
actual configuration disk writes, live worker recovery, external browser-tool execution, physical keyboard/pointer and
screen-reader behavior are not qualified by these fixtures. These are follow-ups, not claims of repaired behavior.

The user requested finishing after this cycle. Complete the current fix, final regressions and scoped local commit,
then stop the audit instead of starting another bug-finding cycle. This does not claim that the product has no bugs.
Unrelated dirty files, runtime pin work and the reference symlink remain untouched.
