# Reference implementation review and transport decision

Package context: [decision overview](README.md), [architecture](ARCHITECTURE-AND-SECURITY.md), [implementation plan](IMPLEMENTATION-PLAN.md), and [validation](VALIDATION-AND-OPERATIONS.md).

This document consolidates the source investigation performed earlier in this conversation. Snapshot rows below retain their original observation time; the fresh machine-readable inventory is [source-snapshot.json](evidence/source-snapshot.json). Earlier recommendations to use Headscale for a personal prototype are alternatives, not a requirement for the proposed public product. The current recommendation is a free hosted application relay plus self-hosting of the same implementation, with Headscale optional.

## Decision report: free hosted connectivity and self-hosting

The user's proposed service model is useful independently of transport selection: users can choose an operated free service or control their own server. It does not require Headscale. An application relay can offer the same hosting choices while supporting browser-only phone access.

| Option                                   | Product fit                             | Additional work or limitation                                                                                         | Disposition                                |
| ---------------------------------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Mandatory hosted Headscale for all users | Private device networking               | Tailscale client enrollment, public-customer isolation, policy management and DERP operation; agent UI still required | Not the recommended default                |
| Bring-your-own Headscale                 | Existing personal/team private networks | Application gateway and device/project authorization remain necessary                                                 | Optional later adapter                     |
| Hosted application relay                 | Browser-first remote AX Code workflow   | Requires relay operation, secure endpoint pairing, client-delivery trust decisions and resource limits                | Recommended default, initially invite-only |
| Self-hosted application relay            | Users wanting independent operation     | Same protocol/artifact with independent identity, TLS, upgrades and recovery                                          | Required final product capability          |

Headscale supports multiple users and policy rules within its single-tailnet model; this review does not claim that multiple users cannot be isolated. A public multi-tenant service would need a deliberately designed and tested isolation layer. User records alone are not independent tenant instances, and the documented no-policy/default-omitted-policy behavior is allow-all. An operator could instead provision isolated coordinator instances, but would then own their fleet lifecycle and per-tenant operations. Neither approach is a free addition to a coding application.

The proposed application relay also needs explicit tenant isolation. Its advantage for this use case is a narrower application surface and browser onboarding, not an automatic security guarantee. Hosted identity must not override local pairing, selected-project scopes, runtime permissions or exact approval requests.

A free managed Headscale offering would need a separate product decision covering scope, quotas, peer visibility, enrollment/tag ownership, policy generation and validation, DERP availability/bandwidth, abuse response, upgrades and tenant recovery. These concerns are deferred, not hidden inside the first relay release.

The free relay likewise needs documented limits and operating responsibility. Measure encrypted transfer bytes, concurrent connections, handshake and buffer use, reconnect storms and slow clients before deciding public quotas or cost commitments. No bandwidth price or financial estimate has been established.

## Reading the source findings

The following report separates source observations, isolated probes, official documentation and recommendations. Kimi's relay implementation demonstrates a practical interaction flow but does not independently establish its cloud authorization, retention, or tenant-isolation guarantees. The included probe receipt reproduces only local transport behaviors. OpenChamber's encryption code is a reference implementation, not an independent cryptographic audit.

Date: 2026-10-17
Status: Research and architectural recommendations only; no product-boundary change approved or implemented.
Scope: Remote access to a coding agent running on an owned development machine, including phone access, approvals, reconnects, and private networking.

## Recommendation

For a consumer-facing AX Code remote experience, use Kimi's browser-based interaction model as a product reference: explicitly enable remote access, scan a link, authenticate, select a machine, and control existing local sessions. Headscale is a useful optional private transport for an individual or small team. It does not supply the agent UI, session protocol, approval UX, or application authorization that Kimi provides.

Do not copy Kimi's tunnel implementation unchanged. Its inspected transport trusts the cloud relay, substitutes a shared local bearer credential, buffers HTTP responses to completion, and does not itself deduplicate completed requests. AX Code should preserve its own durable runtime, permission engine, and session authority; a future remote adapter should expose a bounded application contract with device-scoped authorization and streaming/recovery designed for the existing runtime.

For current AX Code operation, connect to the development host over SSH and run the existing runtime attach command there. This respects the present local-only policy. A remote GUI, an external proxy into the runtime, and connections to a tailnet address require an explicit product decision and the repository's PRD/ADR process. Loopback forwarding does not by itself establish that such a feature is authorized or qualified.

## Evidence and limits

These are inspected local snapshots, not claims about the latest upstream releases:

| Checkout                                     | HEAD at initial inspection | Tracked state at initial inspection                                             |
| -------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------- |
| AX Code                                      | `9f4bdeb76ea4`             | Clean                                                                           |
| OpenChamber                                  | `d648bdedfc2e`             | Clean                                                                           |
| Codex                                        | `e7de1f444089`             | Clean                                                                           |
| Kimi Code                                    | `18c6d6427295`             | Clean                                                                           |
| herdr                                        | `143bf5fd4781`             | Clean                                                                           |
| Cline                                        | `b549ceb4bb42`             | Clean                                                                           |
| Hermes Agent                                 | `521f4dc2a1a4`             | Clean                                                                           |
| OpenCode                                     | `bc5ebf00a4c1`             | Clean                                                                           |
| DeepSeek Harness                             | `1517a4dbca0a`             | Clean                                                                           |
| Headscale (`/Users/akiralam/code/headscale`) | `ff17b7af6caa`             | Existing changes in `hscontrol/auth.go` and `hscontrol/auth_test.go`; preserved |

Source and documentation were inspected. Four isolated local probes exercised Kimi transport code with synthetic data. The Kimi checkout has no installed package dependencies, so its upstream Vitest suite was not executed. No cloud service, production deployment, real login, device enrollment, ACL mutation, or remote tool execution was performed. The Kimi cloud relay service and its account-authorization implementation were not found in this checkout; its cross-account isolation, retention, and production revocation behavior cannot be independently certified from the client code.

Headscale was being edited independently during the review: later status checks named database and configuration files instead of the initial auth-file changes. The inspected auth-file bytes and Kimi transport source hash remained unchanged. This review did not edit any Headscale or reference-project file; the table records the initial observation, not a frozen final checkout.

## How the reference approaches work

| Reference        | Connection and execution model                                                                                                                                                                                                                                   | Useful lesson                                                                                                                                                                                                                              |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| herdr            | A background server owns terminal panes on each machine. The local UI exchanges terminal/session state through an OpenSSH stdio bridge. Disconnecting the UI leaves pane processes alive; a machine/server restart cannot preserve those original processes.     | Separate client lifetime from execution lifetime; negotiate capabilities instead of requiring identical versions.                                                                                                                          |
| OpenChamber      | Host and device connect outbound to a relay. One-time pairing distributes a host encryption trust anchor; encrypted traffic multiplexes HTTP, events, and WebSocket substreams to the local server. Direct connections are preferred when available.             | Separate routing, endpoint encryption, and application authorization. Keep device credentials distinct from server credentials.                                                                                                            |
| Codex            | App-server exposes a bidirectional JSON-RPC contract for threads, turns, events, and approval requests. Its separate remote-control transport enrolls a host, manages pairing/clients, and exchanges per-client/per-stream envelopes over an outbound WebSocket. | Design a semantic control API with pending-request identity, bounded queues, acknowledgements, reconnect cursors, and managed enable/disable state.                                                                                        |
| Kimi Code        | Local web/API server plus outbound management, HTTP, and WebSocket tunnels. The remote browser logs in through the cloud service; the local tunnel authenticates forwarded requests with the local server token.                                                 | Reuse the agent's existing web experience for low-friction phone control; account for the resulting relay trust boundary.                                                                                                                  |
| Cline            | Messaging connectors map conversation threads to RPC-backed local agent sessions. Telegram uses polling and can surface tool approvals as chat replies.                                                                                                          | Thread binding and authorization must be explicit. The inspected Telegram documentation and authorization helper allow access by default when no restriction is configured; this default should not be adopted for AX Code remote control. |
| Hermes Agent     | A long-lived messaging/API gateway owns session authorities, authorization and queues. Canonical clients distinguish read/control scopes and resume with replay handling.                                                                                        | A started turn lost during restart becomes `unknown`, pauses its FIFO, and is not blindly replayed. This is a useful model for uncertain external effects.                                                                                 |
| OpenCode         | A server/client split with event and permission handlers. Its server auth module issues password-derived signed session tokens; password rotation revokes that family of sessions.                                                                               | Client/server separation is useful, but password-wide revocation is a different tradeoff from individual device credentials.                                                                                                               |
| DeepSeek Harness | A web carrier hosts feature routes; its Connection layer supplies Host/Origin checks and browser session authentication. Remote methods use peer principals and resource access metadata.                                                                        | Keep transport concerns separate from authenticated caller identity and resource authorization.                                                                                                                                            |

Source pointers: [herdr machines](/Users/akiralam/code/ax-code/.internal/reference/herdr/docs/preview/website/src/content/docs/connecting-machines.mdx), [OpenChamber relay contract](/Users/akiralam/code/ax-code/.internal/reference/openchamber/packages/web/server/lib/relay/DOCUMENTATION.md), [Codex remote-control protocol](/Users/akiralam/code/ax-code/.internal/reference/codex/codex-rs/app-server-transport/src/transport/remote_control/protocol.rs), [Cline Telegram access](/Users/akiralam/code/ax-code/.internal/reference/cline/apps/cli/src/connectors/adapters/telegram.md), [Cline authorization](/Users/akiralam/code/ax-code/.internal/reference/cline/apps/cli/src/connectors/hooks.ts), [Hermes recovery](/Users/akiralam/code/ax-code/.internal/reference/hermes-agent/website/docs/developer-guide/gateway-internals.md), [OpenCode auth](/Users/akiralam/code/ax-code/.internal/reference/opencode/packages/server/src/auth.ts), [DeepSeek remote access disciplines](/Users/akiralam/code/ax-code/.internal/reference/deepseek-harness/docs/defensive-patterns/remote-and-api.md).

## Kimi: detailed review

### Connection sequence

1. `kimi rc` starts the web/API server and rejects both non-loopback binds and `--dangerous-bypass-auth`.
2. The process reads the selected Kimi OAuth credential, obtains a stable device ID, and acquires a machine-data-directory lock. The public device URL contains no local server token. The CLI prints a QR code for that URL.
3. The host opens `/v1/remote/create`, registers device metadata, and then opens `/v1/remote/http`. The browser authenticates with the same cloud account according to the official guide.
4. HTTP requests arrive as base64-encoded frames. The host strips remote Authorization, Cookie, Host, Origin, and hop-by-hop headers; it adds the local server bearer credential and forwards to the fixed local origin. This is a privileged proxy into the existing API, rather than a separate remote agent engine.
5. WebSocket traffic uses a management `open_ws` message, a local authenticated WebSocket, and a relay stream. HTTP assets are rewritten under `/devices/<id>` so the existing UI runs behind the relay path prefix.
6. Ping/pong monitoring detects silent connections. Failed cycles are closed and re-established with bounded exponential delay. Disabling closes active/pending sockets. Closing only the browser leaves the local task running; stopping the foreground local process takes remote access offline.

Sources: [CLI startup checks](/Users/akiralam/code/ax-code/.internal/reference/kimi-code/apps/kimi-code/src/cli/sub/web/run.ts), [transport implementation](/Users/akiralam/code/ax-code/.internal/reference/kimi-code/packages/remote-control/src/remote-control.ts), [lock](/Users/akiralam/code/ax-code/.internal/reference/kimi-code/packages/remote-control/src/lock.ts), [lifecycle manager](/Users/akiralam/code/ax-code/.internal/reference/kimi-code/packages/remote-control/src/manager.ts), [device client](/Users/akiralam/code/ax-code/.internal/reference/kimi-code/packages/remote-control/src/device-client.ts).

### Strengths worth adopting

- An explicit remote-control gesture and a public URL without the local bearer token provide a practical onboarding flow. The QR code is a device-entry link, not the same one-time pairing mechanism used by OpenChamber.
- Existing local session, tool, and approval logic remain authoritative. The approval route checks the session and pending approval ID and reports already-resolved requests rather than blindly accepting a stale response.
- Reconnect, silent-link detection, cancellation of pending connection attempts, serialized enable/disable intent, and lock ownership have explicit implementation and test cases.
- Device-list, rename, deactivate and delete clients exist in source, although the user guide still qualifies the web device-management UI. Source support is not proof that every deployed UI exposes it.
- The managed OAuth logout path clears cloud-session state and tears down the remote tunnel, with retry handling. This is stronger than leaving a previously authorized tunnel running indefinitely.

Sources: [approvals](/Users/akiralam/code/ax-code/.internal/reference/kimi-code/packages/kap-server/src/routes/approvals.ts), [logout](/Users/akiralam/code/ax-code/.internal/reference/kimi-code/packages/kap-server/src/routes/oauth.ts), [transport and manager test cases](/Users/akiralam/code/ax-code/.internal/reference/kimi-code/packages/remote-control/test/remote-control.test.ts).

### Material limitations before reuse in AX Code

1. **The relay is trusted with application traffic and a powerful control path.** The inspected implementation sends JSON/base64 HTTP payloads and bridged WebSocket frames through the relay without an additional endpoint encryption layer. It authenticates relay connections using the selected OAuth refresh credential, then substitutes the local server token for forwarded requests. Local execution therefore does not imply that prompts, diffs, tool output, or session traffic avoid the cloud. There is no distinct per-device/project read-only scope in this tunnel layer; that would need independent application enforcement. This is a trust-model observation, not a claim of an authentication bypass.
2. **The HTTP path is incompatible with generic live SSE forwarding.** `requestLocalHttp` retains response chunks and resolves only on response `end`. Response fragmentation happens after completion. An isolated loopback SSE probe confirmed that an initial event was withheld until the response ended. Kimi's application has a separate WebSocket event transport; this finding does not establish that Kimi's own live UI is broken. AX Code uses SSE, so a direct transport transplant would require a streaming implementation or an intentional protocol adapter.
3. **Transport reconnect does not supply exactly-once operations.** A completed HTTP `request_id` is removed from the active transfer map. A probe sent the same completed ID again and observed two forwards. This is not evidence that a specific Kimi prompt API lacks its own deduplication; it establishes that the tunnel cannot be relied upon for it. AX Code must retain durable operation identity and reconcile uncertain submissions before retrying.
4. **WebSocket bridge flow control needs separate qualification.** `bridgeSockets` forwards messages with `send` without an explicit queued-byte or pause/resume gate. A synthetic slow-socket probe confirmed that this bridge continues forwarding at a high reported buffered-byte count. The local Kimi server has its own event backpressure checks, so the result is limited to the additional relay bridge. Mobile stalls and terminal output need bounded per-stream queues in an AX Code adaptation.
5. **Non-loopback custom relay URLs are not forced to TLS by this helper.** A pure-function probe showed that an `http://relay.example.test` override becomes `ws://relay.example.test`. Production defaults are HTTPS; this is a custom-configuration hardening concern. An AX Code adapter should reject non-loopback plaintext relay endpoints before credentials are supplied, and use dedicated short-lived remote credentials rather than a broad provider refresh credential.
6. **UI rewriting and foreground lifetime impose maintenance costs.** Replacing HTML/JS/CSS path strings couples the tunnel to the frontend build shape. The CLI remote-control path is foreground-owned and cannot survive closing that process. AX Code already has a persistent project runtime and should keep it as the execution owner; the remote transport should attach/detach independently.

Relevant implementation locations: `remote-control.ts` header substitution around line 216; registration around line 499; WebSocket open around line 633; HTTP transfer lifecycle around line 764; credential transport around line 945; HTTP buffering around line 1062; frame bridge around line 1213; relay scheme selection around line 1257. The source file SHA-256 at review time was `30c4ed90ed00f0e4c567a940214207e3c8ec31fe4db81d022fe68d5e518e00a9`.

### Validation performed

An in-memory TypeScript transpilation loaded the inspected transport into an isolated VM context. Unused OAuth, lock and WebSocket constructors were stubbed; all credentials were synthetic. The HTTP buffering probe used an ephemeral loopback server. No source file was edited.

| Probe                                         | Observed result                                           |
| --------------------------------------------- | --------------------------------------------------------- |
| Non-loopback HTTP relay override              | Converted to plaintext `ws://`                            |
| Incremental SSE response                      | Withheld until HTTP response end                          |
| Repeated completed HTTP request ID            | Forwarded twice                                           |
| WebSocket bridge with simulated queued output | Continued forwarding without a bridge-local pressure gate |

All four isolated assertions completed successfully. These probes verify the listed local transport behaviors; they are not the upstream package test suite, a cloud end-to-end test, or a complete security assessment.

## Headscale's role and limitations

Headscale is the coordination server: device registration, public-key distribution, addresses, DNS, policy and relay maps. Tailscale clients carry the WireGuard data plane. Traffic normally takes a direct peer path; DERP relays encrypted packets when direct connectivity fails. Headscale is not automatically in the application payload path. If its embedded DERP is used, that service has the separate packet-relay role.

The inspected Headscale docs explicitly target one tailnet for personal use or a small organization. This fits an internal deployment better than a default shared network for unrelated public customers. Official iOS/macOS/Windows/Android clients can join a custom coordination server, but client installation and VPN enrollment add onboarding steps compared with Kimi's browser-only flow.

Important implementation constraints:

- **Policy is allow-all unless made explicit.** No loaded policy, or a policy omitting both ACLs and grants, allows node-to-node traffic. Start from explicit restricted grants and test denied paths. Network membership is not sufficient authorization for repository access or tool approval.
- **Serve and Funnel are listed as unsupported.** Do not assume that a `tailscale serve` command provides a supported turnkey Headscale web-access solution. Use normal SSH over the private network today. A future dedicated HTTPS gateway would need separate design, authentication and qualification.
- **OIDC admission filters are not ACL groups.** Enable appropriate admission filtering and PKCE; Headscale documents that OIDC group claims cannot directly be used in policy rules. Explicit policy aliases/tags need their own management.
- **DERP needs an operational decision.** Embedded DERP is off by default. Public DERP maps remain configured unless removed. Self-hosting all fallback paths requires custom relay configuration, verification and availability planning. The inspected embedded implementation sets client verification to fail closed; third-party derper configuration needs separate checking.
- **Access to Headscale is not access to AX Code.** The current AX Code server, attach command, and SDK reject non-loopback destinations. A tailnet address remains non-loopback. A reverse proxy to loopback is still a new remote application entry point with security and product consequences.

Sources: [Headscale design goal](/Users/akiralam/code/headscale/README.md), [feature support](/Users/akiralam/code/headscale/docs/about/features.md), [policy defaults](/Users/akiralam/code/headscale/docs/ref/policy.md), [Apple enrollment](/Users/akiralam/code/headscale/docs/usage/connect/apple.md), [OIDC](/Users/akiralam/code/headscale/docs/ref/oidc.md), [DERP](/Users/akiralam/code/headscale/docs/ref/derp.md), [embedded verification](/Users/akiralam/code/headscale/hscontrol/derp/server/derp_server.go), [AX Code listener policy](/Users/akiralam/code/ax-code/packages/ax-code/src/util/listen-security.ts), [SDK policy](/Users/akiralam/code/ax-code/packages/sdk/js/src/protocol.ts), [existing runtime contract](/Users/akiralam/code/ax-code/.internal/adr/ADR-106-persistent-coding-workspace.md).

## Best practices for a future AX Code remote surface

1. Keep one durable local execution authority. Browser disconnect, transport disable, turn interruption and runtime shutdown must be separate operations with explicit behavior.
2. Expose bounded semantic operations for viewing sessions, submitting/queuing/steering prompts, inspecting diffs, resolving exact pending approvals and interrupting a turn. Give devices/project bindings separate read, submit, approve and control capabilities. Avoid equating a successful tunnel connection with authority over the whole local API.
3. Authenticate the application independently of the network. Use revocable device identities, scoped credentials and exact host/project/session/request bindings. Revocation must terminate or reauthorize already-open event and terminal streams, not merely reject a later HTTP call.
4. Decide the relay trust model explicitly. A trusted HTTPS proxy is simpler; an untrusted relay requires endpoint encryption and an independently trusted bootstrap/key-distribution story. OpenChamber's separation of encrypted transport and per-device application tokens is a useful reference, not a cryptographic certification.
5. Preserve durable acceptance IDs, event cursors, gap detection, bounded replay and current-state refresh. Never automatically replay a side-effecting operation merely because its acknowledgement was lost. Distinguish accepted, executing, failed/unknown and verified-complete.
6. Bind approvals to the current pending request and show the actual action and scope. Reject stale/already-resolved requests. Connection loss or timeout must not silently widen a grant.
7. Bound message sizes, concurrent streams, retained bytes and per-stream output. Apply backpressure and cancellation throughout the relay, including WebSocket bridges. Use heartbeat plus jittered backoff; transport health is distinct from agent progress and host wakefulness.
8. Validate browser Origin and authenticated upgrades; authorize each operation. Strip untrusted identity headers, validate schemas with safe parsers, and keep bearer credentials and session content out of logs. Restrict any proxy target and route set deliberately.
9. Qualify cellular/Wi-Fi handover, sleep/wake, relay restart, host restart, slow clients, two simultaneous approval responders, credential rotation, revoked live streams and ambiguous prompt retries before claiming support.

A practical product split is a Kimi-style AX Code web experience with transport-independent session APIs, an optional Headscale/SSH route for private installations, and a separately reviewed outbound relay for browser-only access. These are recommendations; no remote endpoint, deployment or policy relaxation was created during this review.

## Follow-up: place the feature in the desktop checkout

The user proposed implementing the feature in `~/code/ax-code-desktop`. This is the appropriate product entry point: desktop settings can own explicit enable/disable, machine/device pairing, revocation, connection health, allowed-project selection, and the remote review/approval experience. It should continue to consume the published SDK and signed runtime rather than acquiring a second agent engine.

Current source supports that division. The desktop app already hosts its web/API server in an Electron utility process, supervises the coding runtime, and supplies a per-boot backend credential without persisting it. Network forwarding and serialization should remain off the renderer and Electron main event loop. A remote connection worker should expose a narrow authenticated desktop gateway; remote devices should never receive the internal runtime password or obtain unrestricted proxy access merely by connecting.

Suggested path: remote browser -> authenticated transport -> desktop remote gateway -> existing local runtime contract -> permission/isolation checks and durable session execution. Headscale can be one private transport. A hosted outbound relay can provide the browser-only alternative. Both transports should drive the same application operations and approval bindings.

The desktop service also currently enforces loopback-only binding, and its remote-instance guide explicitly says remote host switching and SSH access to the AX Code service are disabled. This proposal introduces a new remote access boundary, even if its last hop is loopback. Define the desktop/runtime contracts and accepted PRD/ADRs before changing that boundary. Also specify what happens when the remote page closes, the local window closes, the desktop app quits, the relay fails, and the host sleeps. The current parent-death cleanup must not be mistaken for an independent always-on remote agent service.

Initial scope should be one owner, explicitly selected projects/sessions, progress and diff viewing, queued prompt submission, exact-request approvals and interruption. Keep network enrollment separate from authority to operate every project. No source changes in the desktop checkout were made by this review.

Sources: [desktop ownership](/Users/akiralam/code/ax-code-desktop/AGENTS.md), [web/API utility process](/Users/akiralam/code/ax-code-desktop/desktop/packages/electron/src/server-process.js), [runtime supervisor](/Users/akiralam/code/ax-code-desktop/desktop/packages/electron/src/axcode-runtime-supervisor.js), [per-boot runtime credential](/Users/akiralam/code/ax-code-desktop/desktop/packages/electron/src/runtime-auth-password.js), [local-only startup](/Users/akiralam/code/ax-code-desktop/desktop/packages/web/server/lib/ax-code/server-startup-runtime.js), [remote-instance status](/Users/akiralam/code/ax-code-desktop/desktop/packages/docs/content/docs/remote-instances.mdx).

## Official documentation checked

- [Kimi Code Remote Control](https://www.kimi.com/code/docs/en/kimi-code-cli/guides/remote-control.html)
- [Kimi Code Server API](https://www.kimi.com/code/docs/en/kimi-code-cli/reference/server-api.html)
- [Headscale feature matrix](https://headscale.net/stable/about/features/)
- [Headscale policy](https://headscale.net/stable/ref/policy/)
- [Headscale DERP](https://headscale.net/stable/ref/derp/)
- [Headscale OIDC](https://headscale.net/stable/ref/oidc/)
- [OpenAI Docs: app-server protocol and approval lifecycle](https://learn.chatgpt.com/docs/app-server)
- [OWASP WebSocket Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/WebSocket_Security_Cheat_Sheet.html)

## Primary evidence and reproduction

- [Pinned-source Kimi probe harness](evidence/kimi-transport-probe.cjs)
- [Structured probe result](evidence/kimi-transport-probe-result.json)
- [Fresh source revisions and hashes](evidence/source-snapshot.json)

The current desktop checkout, runtime checkout, reference trees and Headscale checkout are read as source evidence. They are not vendored into the product, linked as production workspace dependencies, or modified by the probe. All implementation paths in the plan are proposals pending accepted contracts.
