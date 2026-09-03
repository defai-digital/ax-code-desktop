# ADR-001: Consume the AX Code SDK from JSR

| Field          | Value                                                                                               |
| -------------- | --------------------------------------------------------------------------------------------------- |
| Status         | Accepted                                                                                            |
| Implementation | Complete for SDK 2.2.0; published through OIDC and frozen in the consumer lockfile                  |
| Date           | 2026-09-02                                                                                          |
| Last reviewed  | 2026-09-02                                                                                          |
| Deciders       | AX Coder and AX Code maintainers; explicit user decision                                            |
| Related        | PRD-2026-09-02-ax-coder-product-and-desktop-extraction; SPEC-2026-09-02-ax-code-jsr-sdk-consumption |

## Context

AX Coder must build without an AX Code sibling checkout. The extracted Desktop currently imports the private AX Code
workspace package `@ax-code/sdk`. The user selected JSR instead of npm or GitHub Packages and selected
`@defai-digital` as the organization scope.

## Decision

### D1 — Production SDK dependency

AX Coder consumes `@defai-digital/ax-code-sdk` exclusively from JSR. Production manifests pin an exact version using
pnpm's native `jsr:` protocol. npmjs.org and GitHub Packages are not fallback registries.

### D2 — Runtime dependency

The SDK does not replace the AX Code executable. AX Coder stages a separately pinned, signed AX Code runtime from
GitHub Releases and validates SDK/runtime capabilities at startup. The app uses the SDK's headless or gRPC/native
surface; it does not import AX Code source internals.

### D3 — Local development override

A developer may explicitly override the JSR package with a local checkout for contract development. The override is
never committed to a production lockfile, release artifact, or CI path. Clean-checkout CI must work without
`../ax-code`.

### D4 — Package manager

pnpm remains the AX Coder package manager. JSR is the first-party registry, while third-party npm-compatible
dependencies remain allowed.

## Consequences

- Desktop extraction must rename production imports from `@ax-code/sdk` to `@defai-digital/ax-code-sdk`.
- The first independent build is blocked until the selected SDK version exists on JSR or an explicitly reviewed local
  extraction fixture is used before publication.
- SDK and runtime compatibility become release inputs rather than workspace assumptions.
- Registry publication credentials are not stored in AX Coder.

## Implementation evidence

AX Code tag `sdk-v2.2.0` fixes the immutable producer content at
`1c3eb8cbfa1160c35ec3dbc8d05561b4df248d8c`. GitHub Actions run
[`33696640828`](https://github.com/defai-digital/ax-code/actions/runs/33696640828) published
`@defai-digital/ax-code-sdk@2.2.0` through OIDC. AX Coder commit
`26459b536015607b9e43d7c2c7e55f30e73e500d` committed the JSR-resolved lockfile, and a sibling-free clean clone
passed frozen install and the complete Phase 2 gate.

## Alternatives considered

- npmjs.org and GitHub Packages were rejected by explicit product decision.
- A sibling workspace link was rejected for production because it prevents independent checkout, CI, and release.
- Copying SDK or runtime source was rejected because it creates a second AX Code implementation.
