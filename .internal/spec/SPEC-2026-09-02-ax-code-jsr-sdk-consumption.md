# SPEC: AX Code JSR SDK Consumption

| Field   | Value                                                           |
| ------- | --------------------------------------------------------------- |
| Status  | Consumer ready; first publication and lockfile pending          |
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

The version shown is the planned first contract and must be updated deliberately if the first release uses another
version. A range is not allowed in release manifests or lockfiles.

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

## 6. Current blocker

Registry setup completed on 2026-09-02: `@defai-digital/ax-code-sdk` exists with zero published versions and is linked
to `defai-digital/ax-code` for GitHub Actions OIDC. The remaining blocker is publishing and verifying the selected SDK
version from a reviewed matching release tag.

The AX Coder consumer candidate is implemented at `b3c24fd3cc8ece6a56b7720efcd36285d278a00e`. It uses the exact
production specifier, public imports, package-entrypoint contract tests, and a no-sibling dependency gate. Local
validation against a tarball built from the exact producer commit passed, but does not replace the required JSR and
frozen-lockfile verification.
