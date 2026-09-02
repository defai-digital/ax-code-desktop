# SPEC: AX Code Worker Contract

| Field   | Value                                                     |
| ------- | --------------------------------------------------------- |
| Status  | Accepted implementation contract                          |
| Related | Active PRD; ADR-001; ADR-004; AX Code ADR-055 and ADR-067 |

## 1. Boundary

AX Coder treats AX Code as an external coding worker. It uses the public SDK's headless or gRPC surface and a pinned
signed runtime. It never imports AX Code session, provider, tool, storage, scheduler, workflow, permission, or TUI
implementation modules.

## 2. Compatibility record

Each connection records:

- SDK version;
- runtime semantic version and build identifier;
- runtime artifact filename and SHA-256 digest;
- transport and protocol version;
- negotiated capabilities;
- compatibility result and reason;
- connection time and project identity.

The initial candidate pair is SDK `2.2.0` and runtime `7.10.2`. Compatibility is proven by negotiation and contract
tests, not by matching version numbers.

## 3. Required capabilities

The extraction baseline requires session create/read, prompt/command send, abort, permission and question response,
resumable global and directory events, project/directory selection, task/scheduled-task observation, terminal transport,
runtime health, and actionable version metadata. A missing required capability prevents worker dispatch.

## 4. Authentication and transport

Electron main owns the per-boot runtime credential and injects it at the privileged boundary. The renderer never stores
or logs it. Connections are loopback-only by default. The unified event transport retains cursor resume, deduplication,
backoff, heartbeat, and gap-triggered resync. Terminal binary transport remains a documented special case.

## 5. Dispatch envelope

A future portfolio dispatch includes project and worktree identity, immutable contract revision, task and dispatch IDs,
objective, constraints, allowed paths, acceptance criteria, verification plan, budgets, permission policy, expected
evidence, and an idempotency key. AX Code owns execution truth. AX Coder stores only the dispatch reference and
projection.

## 6. Failure behavior

Unknown versions, missing capabilities, invalid signatures, cursor gaps that cannot resync, or contradictory execution
state fail closed and create an exception. There is no fallback to copied runtime code, an unsigned binary, automatic
permission expansion, or duplicate dispatch.

## 7. Producer and consumer tests

AX Code tests every published SDK subpath and runtime capability schema. AX Coder imports every used subpath from the
installed JSR package and runs fixtures against the pinned runtime. The compatible commits and artifact digests are
recorded in both release evidence sets.
