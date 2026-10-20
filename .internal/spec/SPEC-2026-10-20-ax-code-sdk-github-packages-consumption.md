# SPEC: AX Code SDK GitHub Packages Consumption

| Field      | Value                                                                             |
| ---------- | --------------------------------------------------------------------------------- |
| Status     | Accepted; implementation prepared, lockfile cutover pending producer publication  |
| Created    | 2026-10-20                                                                        |
| Supersedes | SPEC-2026-09-02-ax-code-jsr-sdk-consumption (dependency declaration and registry) |
| Related    | ADR-022; AX Code ADR-265                                                          |

Canonical package page: <https://github.com/orgs/defai-digital/packages/npm/package/ax-code-sdk>.

## 1. Dependency declaration

Each consumer manifest (`desktop/packages/{ui,web,electron}/package.json`) declares the exact version:

```json
{ "dependencies": { "@defai-digital/ax-code-sdk": "2.6.39" } }
```

A range, a `jsr:` specifier and a `workspace:` link are rejected by `script/desktop-release-contract.mjs` and
`script/check-no-sibling-dependencies.mjs`. Import paths (`@defai-digital/ax-code-sdk`, `/v2`, `/v2/client`,
`/headless`, `/grpc`) are unchanged.

## 2. Pin record

`config/ax-code-sdk.json`:

```json
{
  "schema": "ax-coder.ax-code-sdk.v2",
  "name": "@defai-digital/ax-code-sdk",
  "version": "2.6.39",
  "specifier": "2.6.39",
  "registry": "https://npm.pkg.github.com",
  "producerRepository": "defai-digital/ax-code",
  "producerTag": "sdk-v2.6.39",
  "producerCommit": "cc0f084bfc537d4cce9ffb33a7f698b28be2dea6"
}
```

The contract requires: `specifier` equals `version`; `registry` is GitHub Packages; `producerTag` is `sdk-v<version>`;
`producerCommit` is a full commit id; every consumer declares the pin.

## 3. Registry configuration

- Repository `.npmrc`: `@defai-digital:registry=https://npm.pkg.github.com`, nothing else. The contract requires the
  scope line and rejects any `_authToken` or `_auth` value that is not an environment placeholder.
- Local: add `//npm.pkg.github.com/:_authToken=<token>` to the user-level `.npmrc` (a classic token with
  `read:packages`, or one with package access). Never commit it.
- CI: `.github/actions/setup-ax-coder-toolchain` passes `registry-url` and `scope` to `actions/setup-node`; every
  `pnpm install --frozen-lockfile` step sets `NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}`; the workflows and the
  jobs that declare their own permissions grant `packages: read`. Release and shadow jobs follow the same rule.

## 4. Lockfile

`pnpm-lock.yaml` resolves `@defai-digital/ax-code-sdk@2.6.39` to a tarball on `npm.pkg.github.com` with a SHA-512
integrity. It is produced by `pnpm install` against the published package, never edited by hand. The integrity must
equal the producer's package receipt for the tag.

## 5. Cutover and verification

1. Producer publishes the version under the same package name (and grants this repository read access if the package is not public).
2. In a clean checkout with a token that has package access: `pnpm install` (to write the lockfile), then
   `pnpm install --frozen-lockfile`, `pnpm run check:boundaries`, `pnpm run typecheck`, `pnpm run lint`,
   `pnpm run test`, `pnpm run build`.
3. Compare the lockfile integrity with the producer receipt.
4. A push to a branch runs Desktop CI with the repository `GITHUB_TOKEN` to prove the CI path.
