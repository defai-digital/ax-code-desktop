# Proposed architecture and security model

Date: 2026-10-17
Status: Design proposal. Protocol names, storage schemas, package paths, and limits below are candidates until the phase-zero decisions are accepted.

## 1. Ownership

| Component or responsibility                                                                         | Proposed owner              | Boundary                                                                    |
| --------------------------------------------------------------------------------------------------- | --------------------------- | --------------------------------------------------------------------------- |
| Remote settings, pairing consent, device list, revocation, selected projects, and phone review UI   | Desktop checkout            | Product presentation and narrowly scoped remote admission                   |
| Connection worker and remote operation adapter                                                      | Desktop checkout            | No coding tools, provider implementation, or independent agent loop         |
| Sessions, prompts, queues, tools, snapshots, worktrees, permissions, isolation, and execution truth | AX Code runtime             | Invoked through the released SDK and pinned signed runtime                  |
| Hosted relay routing and free-service admission                                                     | Owner to be accepted in D05 | Application connectivity only; no model execution or transcript store       |
| Enterprise policy, credential governance, grants, approvals, and immutable audit                    | AX Trust                    | Consume a verified contract if available; do not create a competing surface |
| Future domain-neutral durable manager execution                                                     | AX Agent                    | Existing desktop deferral remains in force                                  |
| Platform observability                                                                              | AX Telemetry                | Local bounded connection counters are not a new telemetry product           |

The existing desktop portfolio service decision covers product reconciliation, not a second runtime proxy. A new remote connector is deliberately narrower and requires an explicit architecture decision. Do not attach it to the deferred portfolio/manager work by implication.

Sibling inspection found the AX Trust checkout and current gateway documentation. AX Agent's local README describes an early SDK/CLI/loopback product, and a committed HEAD was not available during the inspection. The AX Telemetry directory had no repository HEAD or root README available. None of these observations establishes a released remote-control identity, grant, or audit API. D03 must resolve identity availability without assuming one.

## 2. Processes and deployment

Keep network serialization, encryption, reconnects, and queue management outside the renderer and Electron main event loop. Electron main supervises a bounded connection worker using the existing process conventions; the exact worker packaging is decided in D05/D07. The worker invokes a narrow local adapter rather than accepting arbitrary URL/method/header forwarding.

The local runtime and ordinary desktop server remain loopback-bound. Remote enablement creates an outbound relay connection; it does not change the listener to `0.0.0.0`, a tailnet address, or a public interface. This preserves listener constraints but does not eliminate the need to approve and secure the new remote gateway.

The relay is a portable service. The proposed first deployment uses one server implementation and an OCI artifact suitable for both hosted pilot and self-hosting. An initial single-instance pilot may have a documented availability limit; do not describe it as highly available. Multi-instance routing, a shared metadata store, and distributed connection ownership are a separate qualification milestone. Do not build a second Cloudflare-specific relay implementation in parallel with the portable server.

Static browser assets are versioned and served as application assets. Avoid rewriting arbitrary local HTML/JavaScript/CSS through the tunnel. The remote client uses a small versioned remote-control contract; local runtime events are projected into it as they arrive.

## 3. Trust boundaries

| Boundary                                           | Trusted for                                                           | Must not be trusted for                                                                        |
| -------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Account/identity provider                          | Account authentication and relay admission                            | Granting local project/tool access solely because an account logged in                         |
| Relay                                              | Routing, limits, connection availability                              | Reading payloads, changing approved actions, substituting host/device keys, or approving tools |
| Browser application delivery                       | Supplying the executing remote client in the initial web model        | Being harmless after compromise; this remains an explicit trusted component                    |
| Paired browser device                              | Proving possession of its approved device key                         | Access outside current local scopes; device display names are self-reported labels             |
| Desktop gateway                                    | Local pairing grants, target mapping, operation admission, revocation | Independently deciding runtime tool approval or reconstructing an agent loop                   |
| Runtime                                            | Canonical execution state and permission enforcement                  | Automatically granting more access because the caller arrived remotely                         |
| Project files, diffs, tool output, and web content | Data displayed with provenance                                        | Instructions to the connection protocol, browser DOM, or permission system                     |

Threats include a malicious relay, cross-account routing mistakes, stolen device state, account takeover, replay, stale approval responses, browser-origin attacks, a malicious project/diff, resource exhaustion, copied host profiles, ambiguous acknowledgements, process restarts, and self-host endpoint substitution.

Excluded guarantees must be stated: a compromised host OS, a fully compromised paired browser, or malicious application code already executing in that browser can access endpoint plaintext. Encryption does not hide traffic sizes, connection timing, IP addresses, or all account/device routing metadata from the relay.

## 4. Encryption and client delivery

Require TLS/WSS for all non-loopback production endpoints, plus an authenticated endpoint channel between browser and desktop. Reject insecure remote endpoint overrides before loading or transmitting credentials. Loopback development exceptions must be explicit and excluded from production artifacts.

D02 selects a maintained protocol implementation with browser and desktop support, interoperability vectors, dependency provenance, replay protection, key confirmation, and a documented rekey/reconnect strategy. Noise is a candidate framework, not an already selected or certified library. Do not hand-build a new ECDH/HKDF/AEAD state machine or copy reference crypto and call it audited.

Bind peer keys, the protocol/version, relay identity, gateway identity, and connection epoch into the authenticated handshake/application context as specified by the selected protocol. Encryption sequence numbers and durable operation IDs are different mechanisms. Never reuse cipher state after a process restart; reconnect establishes fresh transport keys and then resumes application state.

The initial web client must disclose its trust in the application-delivery origin. A relay backend compromise with unchanged trusted client code should reveal only ciphertext. A party that can replace the browser application's HTML/JavaScript can potentially exfiltrate endpoint plaintext. CSP, pinned dependencies, reproducible assets, and SRI reduce supply-chain exposure but do not make malicious top-level HTML trustworthy. A stronger claim that even a malicious application publisher cannot read content requires a separately trusted installed client, extension, or independently authenticated bootstrap. Freeze this distinction before publication.

## 5. Pairing and account admission

Proposed flow:

1. The local operator enables remote control and selects existing projects. Default scopes are read-only.
2. The desktop creates a short-lived, single-use invitation tied to the host identity and relay endpoint. Store a verifier, not the raw invitation secret, in ordinary local state.
3. A QR/link carries the invitation and host trust anchor to the remote device. Keep secret material out of URL query strings, access logs, referrers, analytics, and screenshots retained as evidence. A fragment is one transport option, not protection against malicious client code.
4. The browser authenticates with the selected relay's identity provider and generates a device key. Hosted-account login is relay admission only. The device proves key possession over the authenticated endpoint channel.
5. The desktop displays the claimed device label, fingerprint, requested projects, and scopes. The operator confirms locally. Invitation redemption and grant creation are serialized and atomic; simultaneous redemption admits at most one pairing.
6. The paired device receives a narrowly scoped local authorization record bound to its public key. Future connections require key possession and current grant validity.

Reject expired, used, cancelled, endpoint-mismatched or host-key-mismatched invitations. A copied data directory cannot silently create a second active host identity; detect conflicts and require explicit recovery. Account recovery must not silently replace the pinned host key or local pairing grant.

Browser identity state is origin-bound. Moving from hosted to self-hosted client origins may require re-pairing. Do not promise automatic transfer of non-extractable browser private keys. Validate IndexedDB/private-mode/storage-loss behavior and provide a visible revoke/re-pair workflow.

Use standard OIDC/OAuth flows and short-lived service-specific credentials. Browser WebSockets cannot be assumed to support arbitrary Authorization headers. The finalized transport must choose an authenticated upgrade or a bounded pre-authentication state with a one-use connection ticket, exact Origin checks, short deadlines and no application dispatch before authentication. Never put a long-lived bearer or model-provider refresh token in a WebSocket URL or subprotocol.

## 6. Secret and metadata storage

| Location                       | Allowed material                                                                                                    | Prohibited material                                                                             |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Desktop protected secret store | Host/device private keys and local pairing secrets under the chosen platform mechanism                              | Plaintext fallback disguised as protected storage                                               |
| Desktop ordinary state         | Public keys, hashed invitation verifiers, labels, opaque project mappings, grant revisions, expiry/revocation state | Runtime passwords, provider credentials, session transcripts copied for relay use               |
| Browser device storage         | Origin-bound device key and minimal authenticated session state                                                     | The desktop runtime credential or provider API keys                                             |
| Relay metadata store           | Opaque account/device/routing references, admission/expiry state, protocol version, bounded abuse counters          | Prompts, diffs, tool output, project paths/names, runtime credentials, decrypting endpoint keys |
| Relay memory                   | Bounded transient ciphertext and connection routing                                                                 | Durable offline task queues or unlimited message retention                                      |
| Logs/metrics                   | Safe outcome codes, protocol version, aggregate bytes/latencies and disconnect categories                           | Bearers, pairing secrets, content, raw command text, model keys, public routing secrets         |

Platform secret storage is an implementation gate. In particular, do not assume every Linux Electron secret-store backend provides equivalent protection. If an acceptable store is unavailable, remote enablement fails with an actionable state; a developer-only exception must not enter a production package.

## 7. Local scopes and remote operations

Candidate operations are semantic names, not existing API promises:

| Operation                                                    | Local scope        | Required binding                                                            |
| ------------------------------------------------------------ | ------------------ | --------------------------------------------------------------------------- |
| List selected projects and sessions; read bounded state/diff | `session:read`     | Device, gateway, allowlisted project, session and current worktree          |
| Submit ordinary prompt or queued follow-up                   | `prompt:submit`    | Stable operation ID, target session and payload fingerprint                 |
| Respond to a pending tool permission request                 | `approval:respond` | Exact pending request, session, generation/turn, action and requested scope |
| Respond to a supported pending question                      | `question:respond` | Exact pending question and current session generation                       |
| Interrupt an active turn                                     | `turn:interrupt`   | Current turn/generation, not a stale cached selection                       |
| Subscribe/resume events                                      | `session:read`     | Authorized target set, bounded cursor and connection epoch                  |

Scope upgrades happen on the local desktop with a visible preview. Initial grants cannot mutate provider configuration, tool policy, budgets, agent instructions, extension installation, or project registration. The runtime still applies its ordinary permissions and isolation to every tool requested by a remote prompt.

Browser-supplied filesystem paths never select the runtime instance. Map opaque project references to a locally registered canonical directory and worktree, then use branded runtime IDs through the SDK. Symlink/worktree replacement, project removal, and grant narrowing invalidate affected operations and subscriptions.

Each mutation carries a stable request identity and canonical payload fingerprint. The gateway checks grant validity at admission and again immediately before dispatch. Pending gateway work that has not reached canonical runtime acceptance must not retain a revoked grant. A successful connection or cloud account token never becomes a general local API credential.

## 8. Streaming, acceptance, and recovery

Use the existing resumable event contract. The desktop adapter consumes the canonical stream and emits bounded encrypted event batches promptly; it must not wait for an HTTP response to end. No second producer/event database is introduced merely to serve remote viewers.

Maintain per-authorized-stream cursors and detect gaps. A cursor belongs to its gateway, runtime instance, project and session; it is not portable across machines. On a gap or version mismatch, refresh the bounded authoritative state before enabling mutations. Cached disconnected views are visibly stale and cannot approve or interrupt work.

Transport acknowledgements only confirm frame delivery. Mutation acceptance must be durable at the runtime's canonical admission boundary, using its stable message/request identity. A desktop receipt is an index to canonical acceptance, not a second task queue. If a needed canonical lookup/deduplication capability is missing, phase zero creates an additive runtime/SDK work item rather than approximating exactly-once behavior locally.

After an ambiguous submit, query the original operation's canonical receipt/state. Do not resend with a new ID. Reusing an ID with a different payload is a conflict. Interrupted running work is inspected; it is not automatically replayed after host/runtime restart. Accepted queued follow-ups retain the existing runtime recovery policy.

Approval responses must use the current pending request and allowed decision subset. Reject already-resolved, expired, wrong-device, wrong-target or stale-generation responses. Two devices racing to answer must converge on one authoritative result. A reconnect cannot renew an expired approval or recreate a previous grant.

## 9. Revocation and lifecycle

Local revocation increments the grant revision, closes affected endpoint channels, drops pending undispatched mutations, and removes read subscriptions. Checking only future HTTP requests is insufficient. Relay-side account suspension can block connectivity but cannot silently edit local tool grants.

Revocation cannot undo executed side effects. Work already durably accepted by the local runtime follows its existing execution and queue policy; the local owner can interrupt or cancel it explicitly. If the product later requires revocation to cancel accepted jobs, that needs a separate canonical runtime contract and acceptance tests rather than an implicit gateway action.

| Event                                           | Proposed version-one behavior                                                              |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Remote page closes or cellular connection drops | Local accepted work continues under existing runtime rules                                 |
| Remote access is disabled                       | Close remote channels; preserve local sessions and evidence                                |
| Relay restarts or is unavailable                | Show offline/reconnecting; local accepted work continues; do not queue new cloud jobs      |
| Desktop renderer reloads                        | Restore connection UI from the privileged connection owner                                 |
| Last desktop window closes                      | Follow the explicitly documented current app/tray lifecycle; qualify each platform         |
| Desktop app quits                               | Close remote access and follow existing owned-runtime shutdown; no new always-on guarantee |
| Host sleeps or shuts down                       | Remote access unavailable; no wake or continued-execution promise                          |
| Runtime restarts                                | Re-negotiate identity/capabilities, refresh state and pending approvals before mutation    |
| Relay endpoint/account is changed               | Disconnect, clear old admission tickets, verify the new endpoint and re-pair as required   |

Do not add an OS service, keep-awake override, unattended auto-restart policy, or login startup merely to make remote control appear persistent.

## 10. Hosted, self-hosted and Headscale modes

Hosted and self-hosted relays share the same protocol, source, artifact format and connection behavior. Select deployment-specific identity configuration and limits; do not hard-code the hosted service into the client. Never send hosted AX Code account credentials to an arbitrary user-entered endpoint. A self-hosted relay has its own verified origin, identity issuer/audience and login flow.

Server selection, supported protocol versions, frontend origin, TLS requirements and fingerprint changes are visible before pairing. Redirects must not move a credential-bearing request to a different origin. Certificate errors fail closed. Account ownership, gateway routing and local device grants remain separate checks.

Headscale can later carry connectivity to a purpose-built private gateway using the same application authorization. It is not required for the relay flow. A free public Headscale service would additionally need strict account/device/peer isolation, enrollment policy, abuse controls and DERP capacity. Its single-tailnet design and client enrollment burden make it a separate product/operations decision; do not place unrelated public customers into one broad policy by default.

## 11. Sources and governance

Current local sources: [server process](../../../desktop/packages/electron/src/server-process.js), [runtime supervisor](../../../desktop/packages/electron/src/axcode-runtime-supervisor.js), [runtime credential](../../../desktop/packages/electron/src/runtime-auth-password.js), [SSE proxy](../../../desktop/packages/web/server/lib/ax-code/proxy.js), [loopback policy](../../../desktop/packages/web/server/lib/security/local-only.js), [event connection state](../../../desktop/packages/ui/src/lib/event-stream/connection-state.ts).

Accepted constraints: [source boundary](../../adr/ADR-002-product-and-source-boundary.md), [portfolio service](../../adr/ADR-005-persistent-portfolio-service.md), [AX Agent deferral](../../adr/ADR-007-defer-ax-agent-manager-integration.md), [process model](../../spec/SPEC-2026-09-02-desktop-process-model.md), [worker contract](../../spec/SPEC-2026-09-02-ax-code-worker-contract.md). Historical names in these accepted records are not new product branding.

Primary security references: [OWASP WebSocket guidance](https://cheatsheetseries.owasp.org/cheatsheets/WebSocket_Security_Cheat_Sheet.html), [Noise framework](https://noiseprotocol.org/noise.html), [Web Cryptography security considerations](https://www.w3.org/TR/webcrypto/#security-considerations), [OAuth Security BCP, RFC 9700](https://www.rfc-editor.org/rfc/rfc9700.html). These references inform the proposed controls; they do not certify an unimplemented design.
