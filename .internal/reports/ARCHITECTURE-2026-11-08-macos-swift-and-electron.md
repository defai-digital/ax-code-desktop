# macOS Swift and Electron architecture review

Date: 2026-11-08.
Status: Recommendation only; no platform migration, accepted governance change, or release authorization.
Reviewed source: `31274a334ff00c10fc99f41b9803603d4209454a` (clean checkout).

## Recommendation

Keep Electron for macOS and Windows. Keep the existing Linux Electron distribution as well. Prioritize the current
embedded WebMCP experience and measured improvements to startup, memory retention, rendering, and macOS interaction.
Do not start a separate Swift desktop implementation based only on an assumed performance or native-UI benefit.

The initial request considered a Swift macOS app with Windows remaining on Electron. The follow-up asked whether
Electron is preferable because of WebMCP. For the current implementation, it is: the browser integration depends on
Chromium-specific capabilities, and a Swift/WebKit replacement would require a separately qualified provider.
This is a source-backed engineering recommendation, not evidence that Swift can never support the product.

## Findings

### 1. Embedded WebMCP is the main migration risk

[`native-webmcp.js`](../../desktop/packages/electron/src/native-webmcp.js) attaches to `webContents.debugger`, enables
`Page` and `WebMCP`, obtains the frame tree, and invokes and cancels native tools through `WebMCP.invokeTool` and
`WebMCP.cancelInvocation`. It also binds requests to the current document, origin, enrollment generation, and tool
definition digest. Navigation, revocation, timeouts, late completions, and uncertain cancellation are part of the
behavior to preserve.

[`webmcp-page.js`](../../desktop/packages/electron/src/webmcp-page.js) separately implements bounded page read/act/wait
operations using a fixed program in an isolated execution world. These operations and native WebMCP tool invocation
are distinct capabilities; reproducing DOM interaction alone would not replace the native tool provider.

[`desktop-webmcp-browser.js`](../../desktop/packages/electron/src/desktop-webmcp-browser.js) owns embedded
`WebContentsView` instances, project/session ownership, browser partitions, view eviction, and provider enrollment.
Its launcher-owned provider token goes to the supervised runtime, not to page content or the renderer.

Apple's [WKWebView](https://developer.apple.com/documentation/webkit/wkwebview) embeds web content, and
[WKContentWorld](https://developer.apple.com/documentation/webkit/wkcontentworld) separates script variables while
sharing the DOM. Those APIs do not establish equivalence with this implementation's Chromium debugger commands or
native tool invocation/cancellation contract. Treat a WebKit provider as unproven until an implementation passes the
same behavioral journeys. Do not infer that WebMCP as a concept requires Electron; the current Desktop adapter does.

### 2. Replacing the window shell would not remove the current backend dependencies

[`main.js`](../../desktop/packages/electron/src/main.js) starts the Desktop web server through `utilityProcess.fork`
and supervises the separate AX Code runtime. [`server-process.js`](../../desktop/packages/electron/src/server-process.js)
uses Electron's `process.parentPort` for readiness, diagnostics, notifications, and shutdown coordination.
[Electron's utilityProcess documentation](https://www.electronjs.org/docs/latest/api/utility-process) describes the
Node-enabled child process and message-port transport behind this arrangement.

A Swift host would need another qualified way to run and communicate with the existing Desktop service. It would
also need runtime discovery, integrity checks, restart limits, parent-death cleanup, busy-session protection, and
per-boot authentication. Reusing the Desktop service is compatible with a native UI; duplicating AX Code execution
or AX Agent orchestration is not.

[`api-prefix-router.js`](../../desktop/packages/electron/src/api-prefix-router.js) distinguishes Desktop-owned
services from runtime services, including method-specific overrides. A native client cannot safely assume that every
`/api` route belongs directly to AX Code. The current pins are runtime `7.30.16` and SDK `2.6.69`, recorded in
[`config/ax-code-runtime.json`](../../config/ax-code-runtime.json) and
[`config/ax-code-sdk.json`](../../config/ax-code-sdk.json). Swift cannot directly import the JavaScript SDK; replacing
that integration would need either a Desktop service adapter or a producer-approved native client contract.

### 3. A macOS-only rewrite adds a second UI and qualification surface

The shared React UI currently serves all desktop platforms. Native project navigation, chat, settings, review, and
supervision would need equivalent identity handling, asynchronous updates, error recovery, accessibility, themes,
and the 14 locales in [`desktop/shared/locales.json`](../../desktop/shared/locales.json).

Terminal rendering is consumed from canonical AkiTTY Web under
[ADR-024](../adr/ADR-024-consume-akitty-web-source.md). A Swift rewrite does not authorize copying the native AkiTTY app
or maintaining another terminal implementation. Retaining selected web content in a native host could reduce UI
rewrite scope, but terminal rendering, WASM, IME, keyboard input, resize, and PTY transport would still need testing.

Apple supports [integrating AppKit views with SwiftUI](https://developer.apple.com/documentation/swiftui/appkit-integration).
This makes targeted native components a plausible future option. It does not establish that a full rewrite will
reduce end-to-end memory use or improve responsiveness. A Swift host retaining Chromium for WebMCP would still carry
a browser engine and add another lifecycle boundary.

### 4. Identity and browser storage need explicit migration work

[`config/desktop-identity.json`](../../config/desktop-identity.json) pins the application ID `ai.defai.ax-code-app`,
renderer origin `app://ax-code`, and signing/update identities. Browser storage does not become portable merely by
reusing the bundle ID. Project/UI state, settings, cookies, authentication sessions, browser partitions, and cached
data need an inventory that distinguishes authoritative state from disposable projections.

The [identity continuity specification](../spec/SPEC-2026-09-02-user-data-and-identity-continuity.md) and
[ADR-012](../adr/ADR-012-public-desktop-release-cutover.md) require signed qualification of upgrade, rollback, data,
and credential continuity. Keychain and TCC continuity cannot be inferred from an unsigned Swift prototype.

## Alternatives

| Option | WebMCP impact | Maintenance and qualification | Assessment |
| --- | --- | --- | --- |
| Retain Electron on macOS, Windows, and Linux | Preserves the existing provider architecture | One shared UI; continue platform-specific native checks | Recommended now |
| Electron with a narrowly scoped Swift helper | Provider can remain in Electron | Additional signed helper, bounded IPC, and lifecycle tests | Consider only for a measured or OS-specific gap |
| SwiftUI/AppKit UI with WKWebView content | Requires a separately proven native WebMCP provider | Two UIs plus WebKit, service-launcher, and storage migration qualification | Defer |
| SwiftUI/AppKit UI with a retained Chromium companion | Could retain the provider after host adaptation | Two hosts, focus/embedding/IPC work, signing, and total-process performance testing | Spike only if a native product requirement justifies the cost |

Electron retention does not itself prove every WebMCP path is healthy. The reviewed
[`Electron package manifest`](../../desktop/packages/electron/package.json) and
[`lockfile`](../../pnpm-lock.yaml) both pin Electron `44.9.1` at the reviewed baseline. The subsequent requested
`45.2.3` upgrade is tracked in the [stable upgrade review](ELECTRON-45-2026-11-08-stable-upgrade.md).
Keep compatibility tied to the exact engine build and continue native browser smoke checks on each supported platform.

## Suggested next work

1. Capture a packaged Electron baseline on the same Mac and isolated fixture profile: cold/warm launch, idle with
   no browser views, multiple projects with the existing four-view browser pool, long streaming chat, large diffs,
   terminal output, sleep/resume, and closing/reopening windows. Record the app, helpers, browser/GPU processes,
   Desktop service, and AX Code runtime separately and together; do not report renderer memory as total app memory.
2. Attribute retained memory and interaction stalls before selecting fixes. Investigate view eviction, listener and
   subscription cleanup, list virtualization, worker lifetime, and event batching only where traces show a gap.
   Use the existing [memory investigation](memory-retention-20261026/README.md) as a hypothesis source and remeasure
   the current build rather than treating older results as a present-day baseline.
3. Address concrete macOS interaction issues within the current shell first: menus, shortcuts, window behavior,
   focus, accessibility, appearance, and reduced motion. Preserve the renderer security baseline and shared locales.
4. Add Swift only for an identified capability that existing Electron/native APIs cannot adequately provide, with
   a small request schema, no arbitrary execution bridge, unchanged authority, and signed lifecycle evidence.
   This review does not implement or approve a helper.

## Conditions for reconsidering a full Swift macOS app

- A measured bottleneck or native product requirement remains unresolved after bounded Electron improvements.
- A prototype preserves native tool discovery/invocation, definition binding, enrollment, project/session isolation,
  page read/act/wait, navigation invalidation, revocation, cancellation, and uncertain-result handling. An external
  browser fallback or successful JavaScript evaluation alone does not satisfy embedded WebMCP parity.
- The comparison includes the complete process tree and realistic workloads, with performance and feature targets
  agreed before the experiment. No speed, memory, or bundle-size improvement is claimed by this review.
- The implementation plan preserves the published SDK/runtime boundary, canonical terminal ownership, supported
  platform set (currently macOS 13+ arm64, Windows x64, Ubuntu 24.04+ amd64/arm64), localization, and accessibility.
  Any support change needs an explicit decision rather than an incidental framework deployment target.
- Versioned PRD, ADR, and technical specifications are accepted in that order before boundary-changing
  implementation. Existing accepted records remain intact. Windows and Linux Electron remain independently
  qualified, and the native macOS candidate passes signed upgrade/rollback and data/credential continuity gates
  before any separately approved release cutover.

## Verification and limits

This architecture review inspected the source and pins above, existing governance, packaging, CI selection, and
official Apple/Electron documentation. No Swift prototype, performance comparison, signed installation, UI journey,
or Windows/Linux execution was performed. This recommendation does not change an accepted architecture decision.

The user subsequently requested an Electron 45.2.3 upgrade and application changes to use its improvements. Those
changes, native engine checks, workspace tests, and verified SDK cache bootstrap
are recorded in the [stable upgrade review](ELECTRON-45-2026-11-08-stable-upgrade.md). The expanded scope now includes
application code and requires the full CI selection. Documentation checks do not qualify a native migration or release.
