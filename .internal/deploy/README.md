# Desktop Deployment Preparation

The canonical AX Code deployment pattern was reviewed read-only at
`../ax-code/.internal/deploy/{README.md,deploy,mirror-r2.py}` and its download Worker.
Desktop must use its own package inventory and release gates, not run that CLI/SDK
publisher. See [ADR-010](../adr/ADR-010-desktop-download-distribution.md) and the
[platform and installation specification](../spec/SPEC-2026-10-11-desktop-download-distribution-v1.md).

Public publication is authorized under ADR-012; live serving remains disabled until native qualification passes. Desktop bootstraps and the distribution tool are
implemented locally under the [v2 specification](../spec/SPEC-2026-10-12-desktop-download-distribution-v2.md),
but installer artifacts are not published yet. The independent Cloudflare gateway
and R2 bucket were provisioned on 2026-10-12 UTC. The native installation endpoint
currently returns HTTP 503 because public publication remains disabled.

Current preparation commands:

```bash
pnpm install --frozen-lockfile
pnpm run check:boundaries
pnpm run typecheck
pnpm run lint
pnpm run test
pnpm run build
pnpm run release:preflight
gh workflow run desktop-shadow.yml --ref main -f signing_mode=required -f confirm_shadow_only=true
```

Shadow runs produce private evidence only. Supported installer targets are
macOS arm64, Windows x64, Ubuntu x64 and Ubuntu arm64. The signed workflow requires
effective Apple, Azure and Minisign credentials. Apple notarization accepts either
a complete API-key secret set or `APPLE_ID` plus `APPLE_APP_SPECIFIC_PASSWORD`,
with the frozen Team ID. Both paths validate an isolated runner Keychain profile
before packaging. See the [credential specification](../spec/SPEC-2026-10-12-desktop-notarization-credentials.md). Repository-secret metadata alone
cannot prove organization or environment availability. Never export local keys to
GitHub or modify a sibling gateway automatically.

## Local distribution preparation

Flatten verified signed shadow installer/update assets into an input directory.
Use the exact qualified source SHA and version. `prepare` checks all input Minisign
signatures, copies only the supported inventory, and generates unsigned metadata and
bootstrap files. It never reads signing credentials, publishes or changes policy.

```bash
.internal/deploy/deploy prepare --source /path/to/signed-assets \
  --out .internal/releases/v7.24.5 --version 7.24.5 --commit <qualified-40-character-sha>
```

Sign the generated `install`, `install.ps1`, `release.tsv`, `latest.txt`,
`release-ready.txt` and `inventory.json` with the existing pinned Desktop key using
`desktop/scripts/minisign-artifacts.sh`. Do not replace existing package signatures.
Then verify the complete directory:

```bash
.internal/deploy/deploy verify --source .internal/releases/v7.24.5
```

`upload` is guarded by `config/desktop-release-policy.json` and requires a Minisign-signed
qualification JSON with schema `ax-code-desktop.download-qualification.v1`, exact
`version`, `commit`, SHA-256 `inventorySha256`, and `gates`/`platforms` maps. Each of
the five policy gates and four supported platform keys must have
`{ "verified": true, "evidence": "<reviewed receipt reference>" }`. Sign that record
only after reviewing the real evidence; tool validation does not manufacture it.

```bash
# Only after approved cutover; supply credentials securely through the environment.
.internal/deploy/deploy upload --source .internal/releases/v7.24.5 \
  --qualification /path/to/signed-qualification.json
```

The mirror requires `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` for the
`ax-code-desktop-releases` bucket. It verifies anonymous bytes after each object
upload, refuses immutable version collisions, writes the readiness marker last,
and advances the signed latest pointer after the bootstrap aliases. An interrupted
pointer/signature pair fails closed; retry the same verified directory.

## Gateway and DNS handoff

The user handles DNS. The hostname must be proxied in the `automatosx.com` Cloudflare
zone. DNS does not configure path routing. The checked-in Worker route is
`download.automatosx.com/ax-code-desktop/*`; it takes precedence for that path while
the AX Code custom-domain Worker continues handling its other paths. See
[Cloudflare routing documentation](https://developers.cloudflare.com/workers/configuration/routing/routes/).

This repository uses an independent `DESKTOP_RELEASES` binding and bucket; it does
not edit or deploy the sibling gateway. The operator checks the existing AX Code
custom domain, refuses route takeover, and deploys an isolated snapshot. Use a
Cloudflare API token or an authenticated Wrangler session; credentials are never
written into the deployment configuration. Wrangler must be installed on PATH.
Review the dry-run before any live deployment:

```bash
.internal/deploy/deploy --help
.internal/deploy/deploy gateway-check
.internal/deploy/deploy gateway-deploy --dry-run
.internal/deploy/deploy gateway-deploy
```

The production config defaults `PUBLIC_RELEASE_ENABLED` to `false`. Live route
deployment alone therefore returns 503. `gateway-deploy` rejects configurations
that enable public release and only creates the bucket when it is missing. It
verifies the live Desktop response and existing CLI installer after deployment.
Switch serving on only through a reviewed cutover after the original signing/continuity/approval gates; then publish the
qualified inventory. Do not enable a public `r2.dev` alias as a shortcut.

Once published, install macOS/Ubuntu with:

```bash
curl -fsSL https://download.automatosx.com/ax-code-desktop/install | bash
```

Install Windows x64 with:

```powershell
irm https://download.automatosx.com/ax-code-desktop/install.ps1 | iex
```

The bootstraps retrieve a pinned-hash Minisign 0.12 verifier before checking signed
metadata. They do not require Node, Homebrew or preinstalled Minisign. Gatekeeper
checks Developer ID and notarization on stock macOS; installed developer tools also
validate stapled tickets. Ubuntu resolves DEB dependencies with apt. Windows checks
native OS architecture and the exact Authenticode certificate before starting NSIS.
No bootstrap removes user profiles or credentials.

Still qualify native fresh installations, upgrade/rollback and the anonymous
generic updater before publication. A successful local package, source tag,
mocked installer test or unsigned shadow run is not a public release.

## First public release

The user authorized public Desktop release on 2026-10-12 UTC with Minisign, Apple
signing/notarization and Windows Authenticode required. Authorization is recorded in
`../reports/public-release-20261012/`; cross-platform and migration qualification
remain incomplete. This does not enable policy or certify missing artifacts.

After all signed qualification gates pass and the release policy is approved:

```bash
# Supply CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN securely.
.internal/deploy/deploy stage --source /path/to/verified-release \
  --qualification /path/to/signed-qualification.json
.internal/deploy/deploy gateway-cutover --source /path/to/verified-release \
  --qualification /path/to/signed-qualification.json
.internal/deploy/deploy gateway-check
```

`stage` verifies authenticated R2 bytes while the Worker stays disabled. It never
needs a temporary public bypass. `gateway-cutover` verifies the entire staged
inventory before enablement, proves anonymous bytes afterwards, and disables
serving again if activation or public verification fails. Infrastructure deployment
refuses to disable an already public gateway. Use ordinary `upload` for later
qualified releases on an active channel. Neither new command bypasses release
policy, signature, platform or migration gates. See the
[v3 specification](../spec/SPEC-2026-10-12-desktop-download-distribution-v3.md).

## Historical native baseline access

The manual signed-shadow native package jobs use a repository-scoped `GITHUB_TOKEN`
with `contents: write` because GitHub exposes draft release fixtures only to callers
with push access. The token is passed to the historical fixture download step; no
shadow step creates a tag or publishes a release. All other shadow jobs retain
read-only contents access. The baseline remains unpublished, and its SHA-256 and
Minisign signature are verified before installation. No personal access token or
sibling repository credential is exported to CI.

## Large installer staging

For a signed inventory containing files above the R2 REST 300 MiB guard, use:

```bash
.internal/deploy/deploy stage-multipart --source /path/to/verified-release \
  --qualification /path/to/signed-qualification.json --receipt /path/to/stage-receipt.json
```

This command applies the same signed-inventory, policy and qualification checks before credentials or network access. It snapshots the full qualified inventory, stages small objects with authenticated REST readback, and stages larger immutable objects through native R2 multipart uploads with 32 MiB parts. A temporary isolated Worker accepts only a random authenticated capability, exact qualified keys and pinned part sizes/SHA-256 hashes. Immutable collisions fail closed. Failed uploads are aborted, and the temporary Worker is removed in a finally block. All completed objects receive byte-for-byte authenticated R2 readback before the existing `gateway-cutover` command may activate public serving. The signed installer bytes are never recompressed.

The optional receipt records object hashes and multipart manifests without credentials. Keep it with the release evidence. This command requires a disabled gateway; use the public upload flow only for later releases.
