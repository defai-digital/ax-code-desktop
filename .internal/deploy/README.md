# Desktop Deployment Preparation

The canonical AX Code deployment pattern was reviewed read-only at
`../ax-code/.internal/deploy/{README.md,deploy,mirror-r2.py}` and its download Worker.
Desktop must use its own package inventory and release gates, not run that CLI/SDK
publisher. See [ADR-010](../adr/ADR-010-desktop-download-distribution.md) and the
[platform and installation specification](../spec/SPEC-2026-10-11-desktop-download-distribution-v1.md).

Public release remains disabled. No Desktop bootstrap is published yet. The proposed
`https://download.automatosx.com/ax-code-desktop/install` returned HTTP 404 during
the 2026-10-12 UTC review. The current AX Code Worker accepts only `/ax-code/` on
that hostname, so uploading Desktop files alone will not make this URL accessible.

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
effective Apple, Azure and Minisign credentials; repository-secret metadata alone
cannot prove organization or environment availability. Never export local keys to
GitHub or modify a sibling gateway automatically.

Before publication, implement and qualify both bootstrap installers, an isolated
gateway/mirror, an anonymous generic update feed and the signed upgrade/rollback
sequence specified above. A successful local package, source tag or unsigned
shadow run is not a public release.
