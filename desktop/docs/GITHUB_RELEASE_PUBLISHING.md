# GitHub release publishing

AX Code Desktop owns its independent releases in `defai-digital/ax-code-desktop`. The current
`config/desktop-release-policy.json` records an approved cutover and `v` tag prefix. The Phase 2 handoff is historical;
its proposed `release:desktop` command and `desktop-v` tags are not this repository's current release interface.

Release approval applies to a qualified candidate. It does not waive CI, signing, installation, upgrade, rollback,
data/credential continuity or human approval for a newer version. Source commits and branch pushes do not publish
an app release.

## Prepare and verify the source

Run from the repository root:

```bash
pnpm install --frozen-lockfile
pnpm run check:boundaries
pnpm run check:locales
pnpm run docs:validate
pnpm run typecheck
pnpm run lint
pnpm run test
pnpm run build
pnpm run release:preflight
```

`release:preflight` is read-only. Review its report, the exact candidate commit, version, runtime/SDK pins and CI
results. It does not sign, upload, tag or publish. Shared tests under `desktop/shared` are included in `pnpm run test`.

## Produce a signed shadow candidate

The manually dispatched workflow is `.github/workflows/desktop-shadow.yml`. After reviewing the source, request a
signed candidate for the reviewed branch or tag:

```bash
gh workflow run desktop-shadow.yml --ref <reviewed-branch-or-tag> -f signing_mode=required -f confirm_shadow_only=true
```

Record the workflow's resolved source SHA and verify it matches the candidate. Shadow runs produce qualification
artifacts; they do not create a tag, publish a GitHub Release or advance the public update channel. Unsigned shadow
output is useful for investigation but cannot qualify a public release.

Supported installer targets are macOS arm64, Windows x64, Ubuntu x64 and Ubuntu arm64. Review actual native
installation, updater, upgrade/rollback and data/credential continuity receipts for the exact signed artifacts.
A successful build or mocked installer test does not replace those receipts.

## Publish the qualified candidate

Follow the tracked [distribution operations guide](../../.internal/deploy/README.md) for preparation, verification,
signed qualification and upload to the active Cloudflare/R2 channel. Large installers use its qualified multipart
upload path. Read the current policy and operator help before running a publication command.

GitHub Release assets and the download/update channel must refer to the same reviewed commit, version and signed
inventory. Require explicit approval before creating the `v<version>` tag or publishing. Verify anonymous downloads,
platform signatures and update metadata after publication. A branch push alone is not release completion.

Keep signing material in approved credential stores or CI secrets. Never place credentials in source, command logs,
reports or artifacts. Use the existing pinned signing identity; do not generate a replacement key for an update.
See [Minisign operations](MINISIGN.md) and [the security policy](../SECURITY.md).

## Platform trust and completion

- macOS artifacts require the approved Developer ID signature and notarization.
- Windows artifacts require the approved Authenticode identity.
- Every supported installer and required metadata file needs the pinned Minisign verification coverage.
- Detached Minisign signatures do not replace platform trust or updater qualification.
- Record the exact source SHA, CI run, artifact hashes and native receipts with the release evidence.
- Reconcile local and remote Git state separately from artifact publication and public verification.

Historical handoff details remain in Git history. Local private governance/evidence records are intentionally not
published; the checked-in policy, workflows, verification tools and distribution guide define the available public
operating interface.
