# ADR-010: Desktop Download Distribution

Status: Accepted for preparation; deployment and updater cutover pending evidence.
Date: 2026-10-11
Related: ADR-009; PRD-2026-10-11-desktop-distribution-v1.

Use a separate public Desktop download namespace on `download.automatosx.com`.
Keep `defai-digital/ax-code-desktop` private. Follow AX Code's authenticated
operator upload, immutable version paths, Minisign verification, anonymous byte
verification and readiness-marker-last pattern; do not reuse the CLI installer,
runtime release inventory or mutable root aliases.

Retire Windows ARM64 from Desktop CI, packaging, runtime consumption, artifact
collection, shadow qualification and WinGet generation. This supersedes earlier
Windows dual-architecture candidate requirements only. It does not remove ARM64
support from macOS or Ubuntu, change the AX Code producer, or invalidate historic
release evidence. Preserve existing tags and historical artifacts.

The current shared Worker belongs to AX Code and only maps `/ax-code/`. Its
Desktop routing change requires a versioned cross-repository decision and
verification before deployment, or an approved independent gateway. No change
to the sibling checkout or infrastructure is included in this preparation.

Public download availability does not prove updater migration. Keep the active
updater and publication policy frozen until the original cutover gates pass.
