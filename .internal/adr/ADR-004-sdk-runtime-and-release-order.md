# ADR-004: Pin SDK and Runtime Independently with Producer-First Releases

| Field          | Value                                            |
| -------------- | ------------------------------------------------ |
| Status         | Accepted                                         |
| Implementation | Registry ready; first SDK version pending        |
| Date           | 2026-09-02                                       |
| Deciders       | User; AX Coder and AX Code maintainers           |
| Related        | ADR-001; SPEC-2026-09-02-ax-code-worker-contract |

## Context

The extracted Desktop currently resolves `@ax-code/sdk` and `ax-code` through the AX Code workspace. AX Coder must build
without that sibling checkout while still bundling a verified runtime sidecar. Publishing the SDK and moving the
consumer in one unversioned step would create an unreproducible dependency cycle.

## Decision

AX Code publishes `@defai-digital/ax-code-sdk` first through its tokenless JSR workflow. AX Coder pins one exact SDK
version with pnpm's `jsr:` protocol and commits the resolved lockfile. It separately pins signed AX Code runtime assets
by release version, platform, filename, size, SHA-256 digest, and Minisign verification identity.

The initial compatibility candidate is SDK `2.2.0` with AX Code runtime `7.10.2`, subject to capability negotiation and
consumer contract tests. A matching number is not assumed to imply compatibility. The app fails closed with an
actionable message when required capabilities are missing.

Release order is producer additive contract, SDK publication, AX Coder dependency update, independent candidate build,
and only then public Desktop ownership cutover. A local SDK override is allowed only through an explicit uncommitted
developer setting and is rejected by CI and packaging.

## Consequences

- SDK versions are immutable and runtime artifacts remain independently auditable.
- AX Coder can update UI without silently changing the worker runtime.
- A release cannot depend on a sibling source path or unpublished registry version.
- Runtime credentials remain outside the renderer and package manifest.

## Rollback

Pin the last verified SDK/runtime pair. Never overwrite a JSR version or accept an unsigned runtime fallback.
