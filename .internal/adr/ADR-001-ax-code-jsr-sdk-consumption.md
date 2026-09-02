# ADR-001: Consume the AX Code SDK from JSR

| Field          | Value                                                                                               |
| -------------- | --------------------------------------------------------------------------------------------------- |
| Status         | Accepted                                                                                            |
| Implementation | Consumer ready; blocked on first SDK publication and production lockfile                            |
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

## Alternatives considered

- npmjs.org and GitHub Packages were rejected by explicit product decision.
- A sibling workspace link was rejected for production because it prevents independent checkout, CI, and release.
- Copying SDK or runtime source was rejected because it creates a second AX Code implementation.
