# SPEC: AX Code JSR SDK Consumption

| Field   | Value                                                           |
| ------- | --------------------------------------------------------------- |
| Status  | Implemented and verified for SDK 2.2.0                          |
| Created | 2026-09-02                                                      |
| Related | ADR-001; PRD-2026-09-02-ax-coder-product-and-desktop-extraction |

## 1. Dependency declaration

The production manifest uses an exact version:

```json
{
  "dependencies": {
    "@defai-digital/ax-code-sdk": "jsr:@defai-digital/ax-code-sdk@2.2.0"
  }
}
```

The version shown is the first published contract. Future updates must be deliberate. A range is not allowed in
release manifests or lockfiles.

## 2. Import migration

During the independent-workspace phase, imports move mechanically:

```text
@ax-code/sdk                  -> @defai-digital/ax-code-sdk
@ax-code/sdk/headless         -> @defai-digital/ax-code-sdk/headless
@ax-code/sdk/grpc             -> @defai-digital/ax-code-sdk/grpc
@ax-code/sdk/grpc/node        -> @defai-digital/ax-code-sdk/grpc/node
@ax-code/sdk/mode             -> @defai-digital/ax-code-sdk/mode
@ax-code/sdk/provider-connect -> @defai-digital/ax-code-sdk/provider-connect
@ax-code/sdk/v2               -> @defai-digital/ax-code-sdk/v2
@ax-code/sdk/v2/client        -> @defai-digital/ax-code-sdk/v2/client
```

Imports from `src`, `dist`, sibling paths, or non-exported SDK files fail the repository boundary check.

The source baseline removed the UI package's direct `ax-code` workspace dependency. Its work-mode and provider-picker
imports now resolve through the public SDK. AX Coder must not reintroduce that runtime source dependency.

## 3. Runtime boundary

AX Coder uses `headless` or `grpc` with a signed AX Code runtime artifact. It does not use the in-process
`createAgent()` adapter in production because that adapter expects the private AX Code source runtime package to be
resolvable.

The application records:

- SDK version;
- runtime version and artifact digest;
- negotiated capability set;
- compatibility result and actionable failure reason.

An incompatible runtime fails before worker dispatch. No copied implementation or sibling import is used as fallback.

## 4. Installation and CI

- pnpm 10.9 or newer is required for native `jsr:` dependencies.
- `pnpm install --frozen-lockfile` must succeed without an AX Code checkout.
- CI rejects `workspace:`, `link:`, `file:`, and `../ax-code` SDK dependencies.
- CI imports every SDK subpath used by the app and verifies the expected version.
- Release builds contain the JSR-resolved SDK and separately verified runtime artifact.

## 5. Local override

An uncommitted developer configuration may map the package to a local AX Code SDK build. It must be opt-in, visible in
diagnostics, and rejected by packaging and release checks. The normal development and CI path remains JSR.

## 6. Implementation evidence

`@defai-digital/ax-code-sdk@2.2.0` was published on 2026-09-02 from AX Code tag `sdk-v2.2.0`, which resolves to producer
commit `1c3eb8cbfa1160c35ec3dbc8d05561b4df248d8c`. GitHub Actions run
[`33696640828`](https://github.com/defai-digital/ax-code/actions/runs/33696640828) completed the OIDC publication after
regeneration, generated-drift, typecheck, test, and dry-run gates passed.

The consumer implementation began at `b3c24fd3cc8ece6a56b7720efcd36285d278a00e`. Commit
`26459b536015607b9e43d7c2c7e55f30e73e500d` added the production lockfile, which resolves the exact version from
`npm.jsr.io` with SHA-512 integrity and contains no local SDK source. Final Phase 2 implementation commit
`e0d0d69f0d3d4628ede504cdbfa3e3065320bbb9` passed a sibling-free frozen install and the complete independent
workspace, package, and smoke gate.
