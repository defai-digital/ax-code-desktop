# ADR-022: Consume the AX Code SDK from GitHub Packages

| Field          | Value                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------- |
| Status         | Accepted by explicit maintainer instruction, 2026-10-20                                                 |
| Implementation | Prepared; the lockfile cutover waits for the producer to publish (see Cutover order)                    |
| Date           | 2026-10-20                                                                                              |
| Supersedes     | ADR-001 decisions D1 and D3 and ADR-004's JSR publication and `jsr:` pin mechanics (registry only)    |
| Related        | AX Code ADR-265; AX Code PRD and SPEC 2026-10-20 GitHub Packages distribution; ADR-004; ADR-012        |

## Context

ADR-001 selected JSR for the first-party SDK and named GitHub Packages as not a fallback. The maintainers have since
decided that AX-owned JavaScript packages are mainly for internal projects and move to GitHub Packages. AX Code
accepted ADR-265, removed its JSR publication and prepares `@defai-digital/ax-code-sdk@2.6.39` on
`https://npm.pkg.github.com`. Desktop must follow, because a producer that no longer publishes to JSR leaves the
Desktop pin on a frozen registry.

## Decision

### D1 — Production SDK dependency

Desktop consumes `@defai-digital/ax-code-sdk` as an exact version from GitHub Packages. Manifests declare the plain
version (`"2.6.39"`), not a `jsr:` specifier and not a range. The package identity and every import path are unchanged.
JSR is not a fallback and a mixed pin is rejected by the release contract.

### D2 — Registry scope and credentials

The repository `.npmrc` maps only the `@defai-digital` scope to `https://npm.pkg.github.com`. It holds no credential;
the release contract fails on a literal token. A developer adds the auth line to a user-level `.npmrc`; CI generates
the same line through `actions/setup-node` and passes `GITHUB_TOKEN` (with `packages: read`) to each install step
only, never to the whole job. The token is never sent to another registry and is never stored in a record, log or
artifact. Desktop still custodies no runtime credential.

### D3 — Pin record

`config/ax-code-sdk.json` moves to schema v2 with `registry` and `producerTag`, and keeps the producer repository and
the immutable source commit of the tag. The pin, the three manifests and the lockfile move together.

### D4 — Local development override

Unchanged from ADR-001 D3: a local checkout override is allowed for contract development and never enters a
lockfile, CI or a release.

### D5 — Unchanged

The signed runtime pin, SDK/runtime compatibility checks and producer-first order (ADR-004) are not changed.

## Cutover order

Producer first. The consumer lockfile is generated from the published package and never edited by hand, and a manifest
is never pointed at a version that does not exist on the registry. The producer keeps the package named
`@defai-digital/ax-code-sdk` (no separate internal name); its canonical page is <https://github.com/orgs/defai-digital/packages/npm/package/ax-code-sdk>. GitHub's npm registry requires authentication to install even
a public package; if the package is not public, the producer must also grant this repository's Actions read access
before CI can install.

## Consequences

- Install needs authentication with `read:packages` and access to the package. A pull request from a fork has no
  package access, so external contributors cannot install; this is accepted for an internally used product.
- The packaged app does not need the registry at run time; it bundles what the build resolved.
- Historical records that name JSR keep their text; ADR-001 and the JSR consumption spec are marked superseded in the
  indexes.
- Old SDK versions stay on JSR only as history. Any version Desktop pins must exist on GitHub Packages first.

## Alternatives considered

- Keep JSR for Desktop while the producer publishes elsewhere: rejected, the producer no longer publishes there.
- Vendor the tarball in the repository: rejected, it creates a second copy of a producer artifact and its history.
- Put the token in the repository `.npmrc` through an environment placeholder: rejected, pnpm fails every command
  that runs without the variable, including lint and local scripts.
