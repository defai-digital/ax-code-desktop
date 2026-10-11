# SPEC: Embedded Native WebMCP Provider, Version 1

| Field | Value |
| --- | --- |
| Status | Proposed; implementation contract pending paired ADR acceptance |
| Related | Embedded WebMCP PRD v1; proposed ADR-009; worker contract; producer ADR draft |

## 1. Compatibility and transport

The proposed worker capability is `desktop.webmcp.v1`. This name is a proposal, not a shipped SDK
field. AX Code must publish typed provider enrollment, request events, responses, cancellation,
and revocation through the existing authenticated local SDK/worker transport. Use a provider stream
bound to the boot identity and coding session, not an unauthenticated callback port. Producer contract
tests must demonstrate that untrusted project configuration and the app renderer cannot enroll providers.

Electron main owns the runtime credential and provider connection. No browser debugging endpoint,
credential, arbitrary executable, or local source path appears in project configuration. No generic
remote MCP registration substitutes for this capability. Missing capability prevents enrollment.
SDK shape, protocol schema, producer commit, and signed artifact hashes are frozen before consumption.

## 2. Browser ownership and isolation

Main creates a dedicated `WebContentsView` with `sandbox: true`, `contextIsolation: true`,
`nodeIntegration: false`, `webSecurity: true`, and no privileged preload. Main alone records its
provider/project/session identity and owns its native debugger. It accepts an opaque enrollment ID,
never a renderer-supplied webContents ID. Other app contents and projects are never enrolled.

The session partition is project-specific and in-memory by default. Remembered sign-in uses an
app-owned persistent partition only after an explicit choice and managed-policy checks. Do not copy
existing `persist:openchamber-browser` cookies into it. Configure permissions on this partition itself,
not just `session.defaultSession`. Deny unrelated device/clipboard permissions and unmanaged popups;
downloads, uploads, file navigation, external protocols, and raw cookies are not agent operations.

Enable only the qualified native feature switch required by the pinned engine. The research switch
`--enable-features=WebMCP` affects the Electron process, so agent authorization must remain separately
scoped to enrolled guests. Do not enable all experimental web platform features or disable the sandbox.

## 3. Native protocol and browser behavior

The adapter admits `WebMCP.enable`, `disable`, `invokeTool`, and `cancelInvocation`, plus the fixed
frame/lifecycle observation required by the qualified protocol. It consumes `toolsAdded`,
`toolsRemoved`, `toolInvoked`, and `toolResponded`. Frame identity is verified against the actual
guest document; wire names and schemas are frozen against the selected Chromium revision.

Use the native imperative and declarative APIs. Preserve form validation, manual submission,
`toolautosubmit`, `agentInvoked`, `respondWith`, and user interaction requirements. Only the
controlled probe uses JavaScript evaluation; production adaptation must not evaluate caller code,
inject a page shim, or overwrite native APIs. No unsupported legacy API counts as current compatibility.

Phase 1 admits top-level tools only. Cross-origin and same-origin subframe tools return an explicit
unsupported-frame state until separate frame-policy tests and approval semantics qualify them.
Do not flatten same-named tools across frames or bypass native Permissions Policy.

## 4. Authority and request binding

The proposed dispatch envelope carries the runtime request ID, provider ID, project ID, coding
session ID, connection epoch, document generation, frame identity, exact origin, tool name,
canonical definition digest, input, and deadline. IDs are created by the trusted peers and bound at
enrollment; page data cannot create or change them. Main verifies the live enrolled target before every
call and rejects unknown/stale identities. No renderer IPC endpoint grants agent permission.

AX Code owns origin policy, approval, effect classification, input validation, credentials filtering,
and dispatch. It authorizes against the frozen catalog and exact document identity. Native tools and
outputs are untrusted data. A page's read-only/consequential annotation is a hint and cannot grant
permission or downgrade required confirmation. Existing policy can restrict the feature further.

Runtime dispatch and adapter effect checks form one authorization path. Main checks the envelope's
identity, lifetime, and allowed operation, not a second independently persisted permission model.
Record runtime-owned receipts; desktop observations cannot manufacture execution success.

## 5. Lifecycle and uncertain effects

Invalidate document generation on navigation/reload, including a same-URL reload. Invalidate catalog
identity when a definition is removed or changed. Project switch, disconnect, worker restart, window
closure, renderer crash, and debugger detach revoke enrollment and all queued requests.

Serialize invocations per enrolled guest. Recheck target, epoch, generation, frame, origin, definition,
and deadline immediately before sending the native invocation. Native invocations identify their exact
frame. Observe lifecycle events during execution; a race cannot become an authorized success receipt.
Pending prompts and approvals bind to the same tuple and cannot survive a document change.

Cancel on user abort, timeout, disconnect, or revocation using the native invocation ID when available.
The runtime rejects late results. Cancellation is best effort and does not prove an effect was reversed.
`Completed` plus an unchanged binding and valid bounded result is needed for successful completion;
timeout, navigation, partial submission, crash, and ambiguous responses are uncertain and never retried
automatically. `requestUserInteraction` and manual-submit states retain human control.

## 6. Proposed local bounds

These are adapter transport ceilings; stricter AX Code or managed limits win. They are not new budget
grants. Validate all fields and enforce byte caps before forwarding to the model.

| Item | Proposed ceiling |
| --- | --- |
| In-flight invocations per enrolled guest | 1 |
| Pending authorized requests per provider | 8 |
| Tools in a complete catalog | 128 |
| Complete catalog, UTF-8 JSON | 256 KiB |
| Tool definition including schema | 32 KiB |
| Invocation input, UTF-8 JSON object | 64 KiB |
| Invocation result, UTF-8 JSON | 64 KiB |
| Invocation lifetime | 30 seconds or earlier runtime deadline |

Oversized catalogs/results return explicit errors rather than silently truncated executable schemas.
Do not log raw tool arguments/results, cookies, headers, runtime credentials, or URLs with queries.
Diagnostic projections contain status, counts, timing, engine identity, and non-secret opaque IDs.
Native CDP may materialize an event before application limits can run; runtime payload caps do not
guarantee a browser memory bound. Hostile large-payload/crash tests are required and remain pending.

## 7. Verification and release

Required native tests: imperative/declarative discovery and execution; schema rejection; manual
submit and user interaction; cancellation; unregister/re-register; same-URL reload; redirected origin;
frame policy; stale definition; project isolation; forged provider identity; revoked approval; debugger
detach; worker/guest crash; oversized catalogs/results; blocked protocols; and uncertain effects.

Verify actual AX Code tool dispatch and permission denials with the published SDK and signed worker.
Fake CDP tests establish deterministic adapter checks only; they cannot qualify native compatibility.
Native receipts from direct probes cannot qualify the AX Code runtime path.

Run consumer typecheck, lint, tests, build, boundary/release-contract checks, and native rebuild.
Create signed shadow packages and test Chrome-free fresh installations on macOS arm64/x64,
Windows arm64/x64, and Linux arm64/x64 where supported. Verify license/notice inclusion, engine
provenance, updater identity, profile continuity, upgrade, and data-preserving rollback.

Keep public release disabled until existing shadow/signing/human release-cutover gates pass.
Native feasibility evidence currently covers macOS arm64 only. It does not qualify any other lane.
