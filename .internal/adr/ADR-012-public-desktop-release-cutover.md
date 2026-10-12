# ADR-012: Public Desktop Release Cutover

Status: Accepted; live activation requires verified qualification.
Date: 2026-10-12 UTC.
Decision owner: user, explicitly authorized public Desktop release.
Supersedes: ADR-009 independent release freeze and ADR-010 updater freeze only; all signing and continuity requirements remain active.

Use the already-public independent Desktop repository for version tags `v*`, releases and update-feed discovery. Keep the application and storage identities unchanged. Approval enables the local publication policy but does not enable Cloudflare serving or certify any missing qualification. Existing stage/cutover operators still require signed, exact-inventory native receipts before deployment.

Add hosted installer qualification for macOS arm64, Windows x64 and Ubuntu x64/arm64. Verify a fresh candidate install, historical-baseline install, upgrade, rollback and final candidate reinstall, checking installed version and profile/configuration sentinel bytes across transitions. Historical assets are copied into an unpublished Desktop draft for repository-scoped CI access after independent hash and Minisign verification. No source-repository CI permission is expanded. Candidate platform signing and ASAR/runtime smoke remain required.

Rollback serving through the existing operator's disabled-Worker restore. Do not delete user profiles or credentials, replace the pinned key, overwrite historical release assets or claim mocked tests as native receipts.
