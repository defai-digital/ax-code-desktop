# Round 24 WebMCP self-audit

Scope: the three P1 findings and the advisory-diagnosis P2 reported against `dff149ee`. Changes remain uncommitted on `r24`.

## Closed classes

- Text assignments use `sensitiveFieldName`, the same parser as structured diagnostic paths. Closing quotes, brackets and braces do not hide the left-hand side. The shared corpus includes dot paths, quoted compound names, numeric descendants, repeated closing syntax, both operators, escaped text and fenced diagnostics. Long whitespace and prose retain bounded scanning behavior.
- A local field declaration establishes sensitivity for value-like members throughout descendant objects, arrays and encoded JSON. A descendant field declaration replaces that context; conflicting declarations in one object remain sensitive if any declaration is sensitive. Context does not escape to siblings. Explicit credential keys and credential-shaped text remain filtered independently of inherited context.
- Every owner with a live page receives a synchronous `close` gate. It prevents closure while the existing bounded confirmation runs. Cancellation, dialog failure and a late guest veto retain the window and page. Duplicate close events share one pending operation. Unexpected owner loss clears the dead ownership immediately; a vetoed guest is disconnected and transferred to a trusted surviving app window, or a recreated main window. If recovery fails, the retained page is adopted by the next local browser command and appears in the page switcher. Event-listener rejections are consumed.
- Advisory primitive diagnosis checks every declared property, including properties beyond the field form's 128-property presentation limit. Both type and range regressions cover property 129; the mounted panel verifies the visible type finding.

## Sensitivity decisions

This inventory covers the project-browser/WebMCP paths and the separate development UI tool boundary. Consumers below delegate classification to the shared functions unless a separate decision is explicitly listed.

| Location / decision | Handling |
| --- | --- |
| `shared/webmcp-redaction.mjs`: `WEBMCP_CREDENTIALS` | Known private-key, provider-token, access-key, authorization and JWT shapes. |
| Same module: `WEBMCP_SENSITIVE_NAME`, `sensitiveParameterName` | One name vocabulary; repeated percent decoding is bounded and unknown deep encoding fails closed. URL query/hash OAuth `code` and `state` receive their explicit URL rule. |
| Same module: `webMcpTextLooksSensitive` | Bounded escape decoding; URL user information; raw/normalized query, hash, path and matrix names; embedded parameter pairs; known credential shapes; assignment left-hand sides through the shared path parser. Only a complete quoted redaction placeholder is exempt from assignment filtering. |
| Same module: `trimFieldDecorations`, `sensitiveFieldName` | Linear wrapper trimming; quoted compound names, dot/bracket/index paths, path arrays and JSON Pointer escapes. Used by assignment scanning and field declarations. |
| Same module: `redactWebMcpReport` string branch | Parses encoded JSON without changing its wire type; preserves inherited context across decoding; otherwise invokes text detection. |
| Same module: array branch | Sensitive entry-pair names mask the paired value. Field-path arrays are distinguished from entry pairs. All nested elements inherit the current diagnostic field context. |
| Same module: object branch | Local naming keys replace inherited context. Current sensitive context masks value-like members; direct credential names mask their values. Keys receive text detection before projection. Null/empty direct values retain existing behavior. |
| Same module: safety bounds | Depth, cycles, accessors/proxies, traversal exhaustion and redacted-key collisions fail closed or notify `onTruncate`; input/export consumers cannot treat incomplete data as a complete receipt. |
| Same module: `webMcpDisplayKey` | Long sensitive keys retain a sensitivity marker after truncation. |
| Same module: `webMcpSchemaLooksSensitive` | Recursively identifies sensitive schema property names for JSON-editor concealment. |
| `ui/src/lib/toolHelpers.ts`: `redactDisplayedText`, `redactActText`, `isWebMcpSensitiveName` | Text classification and explicit name/kind classification for action text and credential input controls. |
| Same module: `webMcpResultPreview` | Optional field-name masking; whole-tree redaction before preview bounds; repeated text/key filtering while formatting inert text. |
| Same module: `readWebMcpInvokeInput`, `redactInvokeRecord`, `describeWebMcpCall` | Shared filtering for structured arguments, encoded previews, truncated prefixes and suggested next steps. Complete values remain available for supported diagnosis; incomplete projections are marked. |
| `ui/src/components/mcp/WebMcpToolPanel.tsx` | Conceals JSON when the executable schema, raw text or parsed redaction identifies sensitive content. Primitive fields use the shared name helper. Display, journal, comparison and copy surfaces filter again. |
| `ui/src/lib/webMcpDiagnosis.ts` | Rejects sensitive/placeholder tool names for executable exports; replaces input secrets; rejects incomplete exports. Runtime rejection extraction filters the entire source tree before flattening. Placeholder values are coverage gaps, not validation evidence. |
| `ui/src/components/layout/EmbeddedWebMcpBrowser.tsx` | Conceals a sensitive draft URL; filters the displayed loaded address and origin. |
| `ui/src/stores/useWebMcpBrowserStore.ts` | Rejects unsafe normalized origin/view identities; filters retained journal/result text, rejection details and export input. `useWebMcpApprovalOutcome.ts` filters retained approval previews. |
| `shared/webmcp-catalog-projection.cjs` | A changed display projection marks a native tool name as redacted and assigns a distinct opaque identity/label; executable schemas remain separate from display schemas. |
| `electron/src/native-webmcp.js`: `allowedUrl`, `agentOrigin`, catalog rejection | Rejects URL user information and filters page-authored rejected-tool labels; runtime/debugger errors use fixed metadata. |
| `electron/src/desktop-webmcp-browser.js` | Catalog, status, origin, confirmation title and manual IPC result projections delegate to shared display functions. |
| `electron/scripts/webmcp-check-entry.cjs`, `webmcp-check-lib.mjs`, `webmcp-check.mjs` | URL admission rejects username/password components. Shared filtering applies at every disk write, report evaluation, report readback and serialized/text console output. Execution still receives original input. |
| `ui/src/lib/webMcpToolLint.ts`: `opaqueText` | Numeric, hexadecimal, UUID-like and long unspaced values produce advisory opaque-value findings. This heuristic does not establish credential safety; displayed findings still use shared redaction. |
| UI display consumers | `webMcpCatalog`, `webMcpPropertyDiff`, `webMcpToolForm`, `webMcpToolLint`, `webMcpSummary`, `webMcpCalls`, `webMcpBridgeCoordination`, `useWebMcpPages`, `WebMcpPages`, `WebMcpCancellationStatus`, `WebMcpCallDiagnosis`, `ReviewLandingBrowserEvidence`, `PermissionCard`, `WebMcpApprovalToolInfo` and `ToolPart-impl` delegate to shared redaction/display helpers for their labels, values, logs, copies or previews. |
| `ui/src/lib/desktopUiWebMcp.ts`: `sensitive`, `fillable`, invocation checks | Separate development-only input-control boundary: excludes credential/payment hints, unsupported input types, file, password, read-only and disabled controls; does not echo input values. |
| `electron/src/webmcp-page.js` | Page read/type operations omit password values and reject password typing. This is an interaction rule, separate from diagnostic/report classification. |

## Window and guest lifecycle transitions

| Transition | Handling / evidence |
| --- | --- |
| Create / concurrent create / full pool | Validated project/session and URL; serialized pool operations, pending-create tracking and revision checks; existing ownership is returned as a disclosed focus handle. New creates are rejected while that owner is closing. |
| Initial native attachment / load failure / setup failure | Zero-sized initialization attachment; bounded load and native initialization; failed load remains navigable; failed native setup closes the entry; `finally` clears initialization and restores the selected view. |
| Show / switch / bounds / hide / minimize / restore | One shown view per sender; previous child detaches before the next attaches. Owner listeners read the current entry sender after transfer. Hidden/minimized pages cannot admit new agent work. |
| Navigation / reload / redirects | URL policy; load cancellation and sequence identities; native document generation/reference invalidation; current-document ownership remains intact. |
| Input / editor / late `beforeunload` | Sticky possible-unsaved-work detection plus bounded native document probes. A handler installed after a probe can still veto `closeForEviction`. |
| Enroll / pause / resume / disconnect / runtime replacement | Request and document identities guard enrollment; pause retains the document; disconnect cancels/revokes calls and bounds provider deletion. Recovery disconnects access rather than transferring active agent authority. |
| Sign-in popup create / navigation / close | Same hardened partition, no privileged preload/provider; nested popups denied, URL policy retained; popup work holds agent work. Popup close removes it and wakes held work. Recovery reparents surviving popups to the new owner; newly opened popups use the entry's current owner. |
| Explicit page close | Existing identity-bound confirmation, at most one changed-content reprompt. Unapproved native closure honors every popup and guest veto. Concurrent teardown shares one close promise. Ownership/listeners/storage are retained until native closure succeeds. |
| Owner `close` | Prevented synchronously; a per-owner operation authorizes/closes its pages before retrying native window closure. A failure keeps the owner alive and reveals retained work. Confirmation cannot authorize a page after ownership changes. The same listener installation covers main and additional app windows. |
| Owner `closed` / sender `destroyed` / sender `render-process-gone` | Detach old owner/sender listeners, remove shown/profile ownership and set the owner to null. Try normal guest closure; on refusal, disconnect and recover into a trusted live window. Recovery failure retains the page for adoption by a later local list/create/focus command. No rejected close promise escapes the event listener. |
| No surviving app window | Main-process recovery recreates the main window. If that fails or is unavailable, the next local window adopts the retained entry without recreating the guest or consuming another pool slot. |
| Focus owner / focus race | Cross-window focus still requires a previously disclosed entry identity. Transferred entries remain focusable. Best-effort reveal tolerates native teardown races; list/create/focus can recover retained ownerless pages. |
| Guest renderer crash / debugger detach | Native adapter invalidates generation, tools and references; provider disconnects. Acting commands reject destroyed guests; close/owner cleanup can remove their entries without another unload. |
| Automatic eviction | Conservative idle and unsaved-work probes; native beforeunload veto retains the original page and ownership. Successful eviction removes native resources and remembers only a bounded dormant address. |
| Dormant reopen / close / owner loss | Reopen revalidates sender and owner, then recreates native state through the serialized pool. Explicit close forgets the record. Owner/sender loss forgets dormant addresses and removes the shared dormant listeners. No live unsaved page is represented by a dormant record. |
| Clear project storage | Requires profile ownership and authorization for all affected pages; veto preserves storage; serialized clears cannot race a new guest into a half-cleared partition. |
| Quit / restart / last-window platform routing | `closeAll` reuses `confirmAndClose`, serializes same-sender dialogs, closes guests before waiting on slow runtime revocation and includes pending creates. Refused IDs keep shutdown/restart from proceeding through `browser-shutdown.js` and the quit coordinator. Main's platform/startup/animation routing remains in force. |
| Final teardown | Captures stable guest/debugger handles because Electron clears native view accessors after destruction. Cancelling work against an already destroyed guest rejects pending calls without accessing native debugger methods. Removes owner/sender listeners, shown/live entries, popup windows, adapter listeners, pending loads and provider work only after closure is accepted. Existing listener-flatness/pool tests and new native-destruction/recovery tests cover cleanup. |

Electron behavior reference: [BrowserWindow close](https://www.electronjs.org/docs/latest/api/browser-window/#event-close) and [WebContents close](https://www.electronjs.org/docs/latest/api/web-contents/#contentscloseopts).

## Verification

Native secondary-window checks run through `project-browser-webmcp.mjs`, which imports and executes `checkBrowserSecondWindow` from `project-browser-second-window.mjs`; the helper is not a standalone launcher. The helper now also closes a real secondary owner containing a disposable blank guest and verifies guest cleanup. Native OS confirmation dialogs are not claimed as UI qualification. A separate real-Electron lifecycle probe uses injected confirmation answers and actual native windows/guests to verify cancellation, approved closure, and forced owner loss with an actual vetoing `beforeunload` handler, followed by surviving-window adoption and focus recovery. Its source and log are `/tmp/ax-r24-native-lifecycle.cjs` and `/tmp/ax-r24-native-lifecycle.log`.

New `en.ts` strings: **none**. No English fallback strings were added to UI flows; the existing localized native confirmation is reused.


All final commands exited successfully:

| Check | Result / local evidence |
| --- | --- |
| `node --test desktop/shared/webmcp-redaction.test.mjs` | 16 tests passed; `/tmp/ax-r24-shared-tests.log`. |
| Focused Electron Vitest: browser lifecycle, native adapter, eviction, manual outcomes, redaction and checker entry/library/CLI | 348 tests passed; `/tmp/ax-r24-electron-tests.log`. |
| Focused UI Vitest: tool helpers, diagnosis, form, catalog, calls, bridge coordination, mounted tool panel/browser and browser store | 303 tests passed; `/tmp/ax-r24-ui-tests.log`. Mounted tests use `src/test/dom.tsx`; no source-as-text tests added. |
| `pnpm run typecheck` | Passed; `/tmp/ax-r24-typecheck.log`. |
| `pnpm run lint` | Passed; `/tmp/ax-r24-lint.log`. |
| `node --import tsx script/check-desktop-boundaries.ts --fail-on-violation` | Passed; `/tmp/ax-r24-boundaries.log`. |
| `pnpm run build` | Passed after the final production changes; `/tmp/ax-r24-build.log`. |
| `node desktop/packages/electron/scripts/e2e/project-browser-tasks.mjs --artifacts /tmp/ax-r24-native-tasks` | Passed W3, W4, W6 and W8, CSP and renderer checks. W4 expiry uses the scripted runtime, not a signed runtime timer. |
| `node desktop/packages/electron/scripts/e2e/project-browser-webmcp.mjs --artifacts /tmp/ax-r24-native-webmcp-final` | Passed W1, W2, W5, W7, the imported secondary-window journey, 50 switches, CSP and renderer checks. Includes native secondary-owner/blank-guest closure. |
| `pnpm --dir desktop/packages/electron exec electron /tmp/ax-r24-native-lifecycle.cjs` | Passed real native cancellation, approval, forced owner-loss retention, adoption and focus recovery. |
| `git diff --check` | Passed. |

The first added native secondary-owner close check exposed destroyed native accessors during cleanup. The native probe reproduced that failure, and the stable-handle fix plus deterministic native-destruction regressions closed it before the passing final native runs above. Earlier failed runs remain in `/tmp/ax-r24-native-webmcp*`; only `-final` is the final WebMCP receipt.
