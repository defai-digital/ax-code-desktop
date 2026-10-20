# Desktop UI WebMCP development surface v1

Status: User-requested development implementation, 2026-10-19. Local verification is recorded separately from release qualification.

## Purpose and ownership

Expose AX Code Desktop's own rendered UI through native WebMCP so development agents can inspect and exercise the app.
This is a renderer testing surface extending the existing isolated E2E harness. It is separate from Desktop consuming
website WebMCP tools in its project browser. It adds no coding runtime, worker capability, SDK contract or policy authority.
The renderer sandbox, CSP, IPC allowlist, browser enrollment, compatibility identity and release gates remain in force.

## Activation and lifecycle

The main process accepts only `AX_CODE_DESKTOP_UI_WEBMCP=1` in an unpackaged app and normalizes the value to `0` otherwise.
The existing sandboxed preload exposes the resulting boolean. The main UI entrypoint dynamically loads the provider only
after this opt-in. Registration additionally requires a top-level secure context and native `document.modelContext`.
No polyfill, legacy API fallback, query-string toggle, saved setting, guest-frame registration or production activation.
Abort registration on pagehide, initialization failure and Vite disposal. Held tool callbacks reject after disposal.

## Tools and bounded data

- `ax_desktop_get_ui_state({})`: rendered title, readiness, Settings visibility, up to 30 headings and 100 controls.
  Controls include names, roles, disabled/selected/expanded/checked state, fill availability and opaque references.
  No input values, chat transcripts, credentials, cookies or storage reads. Output is UI observation, not verification authority.
- `ax_desktop_click({ref})`: invoke the current rendered control's normal click handler. Text and sensitive input types
  cannot be clicked through this tool. Reject disabled, hidden, removed or renamed controls.
- `ax_desktop_fill({ref,value})`: update normal text/search inputs and textareas with native setters and bubbling
  input/change events. Maximum 4000 characters. Exclude password, credential, payment, file, disabled and read-only fields.
  Do not submit forms or echo entered values.

References are document-local and expire after every snapshot or successful action. Every call validates its input
independently of the browser schema. No arbitrary selectors, JavaScript, direct IPC, runtime or store commands.
Actions return a new snapshot, but asynchronous rendering must be verified by another read and independent DOM or screenshot
checks. DOM click/input events are synthetic; this does not certify trusted pointer, keyboard, native-dialog or OS behavior.

## Developer entrypoints and evidence

`pnpm run dev:webmcp` launches the built, unpackaged app using the existing E2E launcher's temporary profile/data/project,
stub runtime, disabled updater and loopback CDP port. The exact renderer target is written to a mode-0600 connection file
inside the temporary directory. The launcher stays alive until Ctrl+C or app exit and cleans up its own processes/profile.
CLI clients use this connection file to discover/invoke the three tools through the native CDP WebMCP domain. Only the
recorded app target and main-frame tool catalog are selected. Calls are serialized per client and uncertain effects are
never retried. Screenshot capture is a separate developer CDP action, not an additional registered WebMCP tool.

`pnpm run e2e:desktop:webmcp` proves native discovery and invocation against the real renderer, opens Settings by WebMCP
click, fills the Settings search field, verifies React navigation filtering and restores it, with independent DOM checks.
It retains the harness's CSP and renderer-exception checks. Normal E2E
launches explicitly disable UI WebMCP even if the parent shell enabled it. Packaged targets reject this testing mode.
Use existing E2E journeys for behavior beyond this initial native-tool check. Stub-backed evidence does not qualify live
model execution, runtime policy, release signing, installation, upgrade or rollback.
