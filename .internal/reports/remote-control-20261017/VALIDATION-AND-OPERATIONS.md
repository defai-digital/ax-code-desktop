# Validation, hosted service, self-hosting and operations

Date: 2026-10-17
Status: Proposed acceptance and operating plan. Limits and objectives marked proposed are engineering starting points, not measured product guarantees.

## 1. Evidence levels

| Level | Meaning                      | Evidence required                                                                        |
| ----- | ---------------------------- | ---------------------------------------------------------------------------------------- |
| L0    | Static source observation    | Exact path/revision/hash and bounded claim                                               |
| L1    | Isolated local behavior      | Reproducible probe and structured result; mocks and exclusions disclosed                 |
| L2    | Integrated local application | Real local runtime/SDK and gateway/client fixtures                                       |
| L3    | Real remote network          | Phone/browser, remote desktop, real authenticated relay, controlled fault injection      |
| L4    | Signed packaged platform     | Exact-candidate native install, use, upgrade and rollback receipts                       |
| L5    | Operating/public service     | Measured hosted and self-hosted deployment behavior and externally verified availability |

The included Kimi results are L1. They do not establish L2-L5 or upstream product vulnerabilities. All new AX Code remote behavior remains unimplemented.

## 2. Included investigation harness

Run from the report-package directory, or pass explicit checkout roots:

```bash
node evidence/kimi-transport-probe.cjs \
  --ax-code-root /Users/akiralam/code/ax-code \
  --kimi-root /Users/akiralam/code/ax-code/.internal/reference/kimi-code
```

The harness uses the runtime checkout's installed TypeScript compiler, reads the pinned Kimi transport source, transpiles it in memory and stubs unused OAuth/lock/WebSocket constructors. It uses synthetic credentials and an ephemeral loopback HTTP server. It writes no reference source and makes no public-network request. Output is structured JSON containing the source hash, observations and limits.

Its four assertions cover plaintext custom relay scheme selection, HTTP/SSE buffering, repeated completed request IDs, and bridge-local backpressure behavior. The full upstream package suite is not run because the reference checkout lacks installed dependencies. Do not install or modify reference trees to make the report appear more complete.

## 3. Product verification matrix

| ID  | Scenario                                                       | Required result                                                                | Gate    |
| --- | -------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------- |
| V01 | Remote feature off on clean/current profile                    | No remote listener/dial or scope mutation; ordinary desktop use works          | G04     |
| V02 | Two accounts, guessed gateway/stream IDs                       | No cross-account discovery or delivery                                         | G09     |
| V03 | Login succeeds without local pairing                           | No project data or mutation authority                                          | G05     |
| V04 | Expired, cancelled, reused or concurrently redeemed invitation | At most one valid grant; safe error categories                                 | G05     |
| V05 | Relay substitutes host/device key or endpoint                  | Handshake/trust failure before application dispatch                            | G07     |
| V06 | Read-only device invokes submit/approval/interrupt/settings    | Denied without runtime side effects                                            | G01-G02 |
| V07 | Project/worktree removed, replaced or redirected by symlink    | Target binding fails closed                                                    | G01     |
| V08 | Lost submit acknowledgement, reconnect and retry               | One canonical admission; same operation ID retained                            | G03/G14 |
| V09 | Same operation ID with different payload                       | Conflict; no second dispatch                                                   | G03     |
| V10 | Runtime stops after acceptance but before/while execution      | Canonical queued/failed/unknown state; no blind side-effect replay             | G03/G14 |
| V11 | Two devices answer one approval                                | One authoritative decision; second receives resolved/conflict                  | G14     |
| V12 | Wrong session/generation/request or stale approval card        | Rejected; no grant enlargement                                                 | G14     |
| V13 | Device revoked with active event stream and pending mutation   | Streams close and undispatched work loses authority                            | G06     |
| V14 | Account logout/expiry or relay switch                          | Old admission tickets and live channels invalidated as specified               | G17     |
| V15 | Incremental runtime SSE/progress                               | Events delivered before source stream ends; bounded buffering                  | G11/G13 |
| V16 | Cursor gap, invalid cursor or runtime identity change          | Refresh authoritative bounded state; stale mutations disabled                  | G14     |
| V17 | Slow phone and high-output local session                       | Bounded queues; pressure propagates; local UI remains responsive               | G11     |
| V18 | Malformed, oversized, compressed or excessive frames/streams   | Early validation, bounded allocation and safe disconnect                       | G11     |
| V19 | Hostile browser Origin, CSRF or unauthenticated upgrade        | Rejected before application operations                                         | G09     |
| V20 | Untrusted diff/tool output and secret-like markers             | No DOM injection; no content/credentials in relay diagnostics                  | G10/G15 |
| V21 | TLS error, redirect to another origin, HTTP custom endpoint    | Fail closed; no credential forwarding                                          | G07/G17 |
| V22 | Cellular/Wi-Fi handover, NAT change, relay restart             | Bounded reconnect, resync and no duplicate mutation                            | G11/G14 |
| V23 | Renderer reload, last-window close and app quit                | Documented distinct lifecycle; no orphan remote worker                         | G19     |
| V24 | Sleep/wake, OS login/logout and updater restart                | Accurate availability; safe key/receipt recovery; no false always-on claim     | G19     |
| V25 | Secure storage unavailable or corrupt                          | Explicit remote-enable failure; no plaintext fallback                          | G07/G19 |
| V26 | Copied host profile/data or competing host connections         | Visible identity conflict and fencing                                          | G07     |
| V27 | Self-hosted relay with hosted routing/identity unavailable     | Fully functional self-hosted remote path                                       | G16     |
| V28 | Old/new client, desktop, SDK, runtime and relay combinations   | Capability negotiation; unsupported operations refused                         | G16/G19 |
| V29 | Quota exhausted, overloaded relay, reconnect storm             | Predictable bounded rejection; no local-work interruption                      | G11/G18 |
| V30 | Relay backup/restore and data-schema downgrade                 | Documented continuity or re-pair; no accidental key cloning or lost local work | G18/G20 |

Adversarial tests operate on synthetic accounts/projects on owned test infrastructure. A test that reaches the live network or real user state must have a dedicated fixture and an explicit target inventory.

## 4. Proposed resource and latency budgets

Initial numbers below are candidates to test and revise in W0/W4/W7. They are not public free-tier promises. The selected crypto protocol may impose tighter wire limits.

| Budget                             | Proposed starting point                                                                               | Verification                                                               |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Encrypted transport frame          | At most 60 KiB including framing                                                                      | Reject before expensive decode/allocation; test boundary and fragmentation |
| Ordinary prompt text               | At most 32 KiB, matching a documented product limit                                                   | Reject oversized input without truncation or hidden dispatch               |
| Diff/state reads                   | Paged bounded results; at most 256 KiB logical result per page                                        | Chunk incrementally; authorization applies to every page                   |
| Pending unauthenticated connection | 15 seconds maximum                                                                                    | Flood/timeout tests and bounded global/account counts                      |
| Pair invitation lifetime           | 5 minutes, single-use                                                                                 | Deterministic expiry/concurrent redemption tests                           |
| Per-connection relay queue         | 4 MiB maximum                                                                                         | Slow-consumer tests; global bound also required                            |
| Per-account active channels        | Explicit tested ceiling before pilot                                                                  | Isolation/overload tests; no unlimited default                             |
| Heartbeat and reconnect            | 20-second heartbeat; 60-second silent-link timeout; randomized exponential retry capped at 30 seconds | Mobile sleep/wake and mass reconnect simulation                            |
| Local grant revocation             | Deny new operations immediately; terminate connected channels within 2 seconds on a healthy host      | Measure active-stream and queued-operation revocation                      |
| Adapter processing overhead        | p95 under 100 ms in a controlled same-region fixture, excluding model time and WAN                    | Compare timestamps at authoritative event and remote render                |
| Incremental progress               | First event delivered before the producer stream ends                                                 | Streaming fixture, not a completed-response benchmark                      |

Keep caps on total account/device/stream counts, total process memory and transient connection maps in addition to per-frame caps. WebSocket compression is disabled initially unless independently qualified. HTTP transfer caps do not automatically bound a WebSocket bridge.

## 5. Free hosted service

### Admission and tenant isolation

Hosted authentication admits an account to relay resources. Local pairing separately admits a device to selected desktop projects. Enforce account ownership on gateway registration, route discovery, connection tickets, stream allocation, revocation and administrative endpoints. Routing IDs are opaque and not authorization credentials.

Start with an invite-only pilot and publish a bounded free-service policy after measurements. Required policy dimensions are desktop registrations, paired devices, concurrent channels, handshake attempts, account/IP admission rates, idle timeouts, aggregate transfer bytes and retained metadata. Do not promise unlimited transfer, availability, support, or permanent free quotas before the operating envelope is known.

The relay must not provide a generic TCP proxy, VPN, public shell, arbitrary destination forwarding, exit-node service or durable cloud job queue. Rate limiting remains necessary even when application payloads are encrypted; encrypted bytes do not reveal whether a sender is resource-abusive.

### Capacity evidence

Measure active connections, handshake CPU, encrypted bytes in/out, peak retained bytes, per-stream queue depth, reconnect attempts, tenant distribution and slow-client duration. Determine capacity from sustained and burst load with failures, not an idle connection count alone.

Record the tested server artifact, machine/container resources, load profile, duration, concurrency, payload distribution, p50/p95/p99 latency, disconnect/error rates and peak memory. Estimate service requirements from measured byte/connection distributions; this report contains no price quote or financial estimate.

Headscale is a separate optional infrastructure choice. Hosting it free would additionally require network peer isolation, enrollment and tag-policy management, device-client support and fallback DERP capacity. It would not remove the need for AX Code application scopes and pairing. No shared public Headscale instance is part of the first relay release.

## 6. Storage and retention policy to freeze before public release

| Data                                          | Proposed handling                                                                     |
| --------------------------------------------- | ------------------------------------------------------------------------------------- |
| Prompt/diff/tool/session payload              | No relay persistence; transient ciphertext only within explicit memory/timeout bounds |
| Endpoint private keys and runtime credentials | Never held by relay                                                                   |
| Account/routing/device admission metadata     | Minimum fields only; explicit deletion/export and retention settings                  |
| Invitation verifiers                          | Expire and remove after redemption/cancellation/TTL; no plaintext secret logs         |
| Security/operational logs                     | Safe categories and aggregate identifiers; bounded retention chosen in W6             |
| Metrics                                       | Low-cardinality counters; no prompt, path, command, token or account-secret labels    |
| Backups                                       | Only necessary metadata/configuration; encrypted/protected storage and tested restore |

An opaque routing identifier can still be sensitive metadata. Redact or hash it in exported diagnostic bundles when it can be used to correlate a real installation. Publish accurate retention and deletion behavior; do not imply that encryption makes metadata collection nonexistent.

## 7. Self-hosting deliverables

The self-host package must include:

- A versioned binary or OCI image with immutable digest, dependency/SBOM information and a documented compatibility range.
- A sample deployment manifest and configuration schema covering listen address, TLS, browser origin, public relay URL, identity issuer/audience, storage, limits and logging. No embedded production secrets or invented public DNS records.
- Secret-file or protected secret-store inputs. Avoid putting credentials in command arguments, repository files, QR URLs or container image layers.
- An independent identity-provider setup. Hosted AX Code tokens must not be forwarded to a custom relay. Self-hosted remote operation must work when hosted routing/identity domains are unavailable.
- Health/readiness endpoints, with metrics/admin/debug endpoints private and independently authenticated. Health does not imply that a particular desktop is online or an agent is progressing.
- Backup, restore, migration, upgrade, rollback, identity-conflict and lost-device runbooks. Restoring an endpoint key copy cannot silently run two live hosts with one identity.
- An exact Origin/CORS policy and production HTTPS/WSS requirements. Redirects cannot move credentials to another origin. Document certificate issuance/renewal and remote browser trust.
- A clean-server installation test and a hosted/self-hosted parity matrix, including mobile Safari/Chrome and supported desktop platforms.

Use the same service artifact and wire behavior for hosted and self-hosted deployments. A self-hosted deployment may set different explicit limits; it must not weaken peer authentication, encryption validation, local authorization or revocation behavior.

## 8. Availability and incident runbooks

| Event                                   | Operator action and expected product state                                                                                       |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Relay unavailable                       | Alert on availability; remote UI shows offline/reconnecting; local accepted work remains authoritative                           |
| Connection surge or resource exhaustion | Apply bounded admission/quotas and retry guidance; preserve management access                                                    |
| Suspected account or device compromise  | Suspend relay admission and locally revoke affected device grants; close live channels; preserve safe evidence                   |
| Host key leaked or copied               | Rotate under explicit local recovery; invalidate related pairings; distinguish legitimate host from a clone                      |
| Client delivery compromise              | Disable remote entry, publish incident guidance and revoke relevant trust; encrypted transport alone is not sufficient           |
| Cross-account routing defect            | Stop new admission immediately, isolate affected routes and retain bounded safe evidence; assess plaintext exposure at endpoints |
| Metadata database loss                  | Restore verified backup or require re-enrollment; never rebuild execution truth from relay state                                 |
| Bad relay release                       | Roll back to a compatible artifact; reject unsupported protocol versions; do not force unsafe client downgrade                   |
| Bad desktop release                     | Disable remote feature and use qualified signed rollback while preserving local session data                                     |

Public service expansion requires a named operating owner, incident contact, monitoring/alert routing, backup receipts, response procedure and a documented limit policy. This is part of delivering a free service, not an optional later task.

## 9. Release and rollout evidence

Follow the repository's exact-candidate release procedure. Source merge, SDK publication, signed desktop artifacts, relay deployment, installer channels, a fresh installation and public availability are separate states.

Keep the remote service independent of existing runtime/download distribution resources unless an accepted infrastructure decision explicitly shares them. Do not change updater channels, compatibility identifiers, signing identities or release pins to prototype remote access.

Rollout order: internal synthetic fixtures -> owned real devices -> invited multi-account pilot -> capped public cohort -> broader availability. Advance only after mandatory acceptance IDs have successful receipts and no unresolved isolation, credential, replay or revocation issue remains.

Rollback must close or refuse remote access without deleting local projects, sessions, queues, snapshots or credentials. Where schemas change, qualify both backward-compatible migration and export/restore. Keep a tested way to operate AX Code locally when the relay or identity provider is down.

## 10. Headscale reconsideration criteria

Revisit a Headscale adapter when users require an existing private network, self-managed routing, or access beyond the relay service's intended deployment. Revisit a managed free Headscale product only with a distinct PRD covering public tenant isolation, policy generation/testing, client enrollment, DERP abuse/bandwidth and operator recovery.

The application protocol and local grants should remain transport-independent so this remains possible. Do not make the first relay rollout implement both paths before a concrete need is established.

## 11. Documentation validation versus product qualification

For this report package, validate Markdown/JSON syntax, relative links, ASCII English text, source hashes, probe execution, source-tree preservation and scope of filesystem changes. No desktop/runtime build or product test is claimed for a documentation-only change.

Future implementation must run the package-appropriate checks in `AGENTS.md`, the new focused tests and the native/network/service matrix above. Documentation validation cannot substitute for those receipts.
