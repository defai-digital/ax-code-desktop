# MCP form isolation and save completion

Date: 2026-10-20. Baseline `303f0475`. Local repair and development-harness verification only; no push or release.
See [plan](../plans/PLAN-2026-10-20-mcp-save-isolation.md),
[bounded receipt](SETTINGS-2026-10-20-mcp-save-evidence.json) and
[review disposition](../reviews/mcp-save-2026-10-20/README.md).

## Confirmed problems and changes

1. An update submitted in A could complete after opening the same server name in B and replace B's dirty baseline.
   Returning to A did not invalidate the old completion. A delayed create could clear another project's draft or
   selection; inherited busy state blocked a new project's save. A form generation now changes on directory,
   selected server, draft replacement and unmount. Only that form's completion can reset transient auth state,
   select/clear a created draft, advance its baseline or end its busy state. Navigation resets the form busy state.
   Origin auth cleanup/status refresh and acknowledged mutation feedback still occur after navigation.
2. The dirty-state memo depended on fields but read a mutable baseline ref. Baseline-only save completion left an
   unchanged form appearing dirty. Bounded comparisons now run on render, immediately showing clean submitted values
   while retaining newer edits made during an update.
3. Native testing exposed an earlier race: directory changed before its inventory response. The form populated A's
   old server under B's load key and skipped B's later correct inventory. The config store now publishes non-persisted
   `loadedDirectory` with accepted network/cache inventories. Only matching provenance permits form population and
   saving. Mismatched inventories cannot clear selection or expose old editable values; loading and translated forced
   retry states replace them. Existing async inventory sequencing remains intact. No SDK/runtime contract changes.

## Causal evidence

- Before repair: `/tmp/ax-mcp-save-negative-20261020.log`, 9 mounted deferred tests, 5 failures. These establish late
  cross-project baselines, leave/return, wrong-draft creation, unchanged-save dirty state and inherited busy state.
  An earlier setup pass used the update action label for Create and is not product evidence.
- Native baseline: `/tmp/ax-mcp-save-native-negative4-20261020/`, 11 native actions, a pending Alpha PATCH and a
  completed Beta inventory GET. Screenshot shows Beta selected and Beta's URL in the list while the editable field
  contains Alpha's URL. It stops at this readback failure before Alpha completes. It does not independently establish
  the later baseline overwrite; that defect has mounted deferred evidence.
- Native setup attempts `negative`, `negative2` and `negative3` did not reach that comparison. The harness initially
  selected its cwd project, and the server button's name includes its URL. Corrected setup explicitly selects the
  fixture project, waits for its list and discovers its actual native target. These are setup errors.
- After repair: `/tmp/ax-mcp-save-native-fixed1-20261020.log` and `fixed2`, both terminal exit 0. Each has 23 native
  actions, 8 intercepted requests and two completed project-scoped PATCHes. Beta's field loads before Alpha finishes;
  editing/reverting Beta stays clean after Alpha completes. An unchanged Beta save becomes clean; returning to each
  project reads its submitted fixture URL. Both also pass CSP and uncaught-renderer checks.
- CDP Fetch intercepts every method under `/api/config/mcp*` before opening MCP. All writes receive fixture responses
  or explicit rejection; none continue to the real configuration writer. Servers are disabled remotes using
  `.invalid` URLs, OAuth off. Native WebMCP performs UI actions; CDP provides HTTP fixtures, viewport and independent
  DOM/screenshots. No UI store or input is changed through CDP.

## Verification

- Focused mounted/store tests: 15 passed. Covers separate directory/inventory renders, cache provenance, forced retry,
  leave/return, overlapping project saves, newer update edits, create inventory refresh, late create, navigation during
  pending-auth cleanup, rejected mutations and reload-warning feedback.
- Final full UI run: 568 files, 3,803 tests passed in `/tmp/ax-mcp-save-full-ui-verified-20261020.log`.
  An intermediate run had two 5-second timeouts in existing session-removal/auto-cleanup tests and an ensuing missing
  hook setup failure. Their focused recheck passed all 7 cases, and the final full run passed with unchanged defaults,
  assertions and timeouts. Contention is possible but is not an established cause.
- Build, separate UI typecheck, focused ESLint, boundaries/source-text checks and release identity passed. Identity
  remains app 7.27.3 / SDK 2.6.37 / existing user runtime pin 7.27.7; that pin is not staged in this repair.
  The last test-only auth fixture initially widened its server helper to a local/remote union, causing a TypeScript
  error when adding remote OAuth fields. Narrowing that helper to the remote union member changed no runtime behavior;
  the final separate typecheck and all 15 focused tests passed again.
- Locale check: 14 locales, 4,939 keys, 64,207 translated entries. Both added inventory messages have translations.
- Native all-Settings regression: 15 pages, 616 control observations passed in `/tmp/ax-mcp-save-settings-20261020.log`,
  including narrow/light/dark and malformed-response checks.
- Ordinary default-path desktop E2E: all 10 checks passed in `/tmp/ax-mcp-save-default-20261020.log`, including fresh
  reload, one supervision pop-out, approval/denial and goal revision routing. Native UI WebMCP stays opt-in.
- Actual populated 800 by 700 dark/light screenshots and the baseline screenshot were inspected. Project paths wrap;
  transport controls and the URL input stay within content bounds. Settings and content scroll independently; long
  input values scroll inside their input. Physical mobile and assistive technology are not qualified.

## Limits and remaining leads

This qualifies Desktop form ownership and HTTP-response handling, not real MCP connection, OAuth exchange, providers,
config disk writes, runtime restart or durable execution isolation. Pending-auth coverage mocks callback preparation,
cleanup and the browser opener; it does not open a real authorization page.

Muse's suggestions about newer edits during creation and overlapping OAuth remain separate unconfirmed leads. Sidebar
mutation targeting during inventory transitions is another source-review lead for a later populated test. These are
not claimed fixes. The broader audit remains active; this does not assert that no other Settings bugs exist. All
unrelated dirty files and the reference symlink remain untouched.
