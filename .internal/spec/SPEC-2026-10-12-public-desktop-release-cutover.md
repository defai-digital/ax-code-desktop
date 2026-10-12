# Public Desktop Release Cutover

Status: Accepted; implementation and native execution in progress.
Related: ADR-012.

The updater resolves `v*` stable releases in the independent public repository. Legacy `desktop-v*` tags are excluded. Application identity, runtime pin and SDK pin remain frozen. Public upload requires the signed distribution qualification bound to version, immutable source commit and inventory SHA-256. Approval alone is insufficient.

Native installer qualification is restricted to GitHub Actions with `RUNNER_TEMP` and an isolated profile/config directory. Download historical baseline assets from a nonpublic Desktop draft using the repository-scoped token and verify pinned SHA-256 and Minisign before execution. Verify candidate signatures before installation. Exercise fresh installation, baseline-to-candidate upgrade, candidate-to-baseline rollback and final candidate reinstall; installed versions must match and profile/configuration sentinel hashes must remain unchanged. Execute candidate installed ASAR UI smoke and retain per-target receipts, including source SHA and both installer hashes. Never write raw credential values into evidence.
