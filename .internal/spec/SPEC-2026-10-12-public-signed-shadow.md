# Public Signed Shadow Workflow Contract

Status: Implemented; cross-platform execution pending signing credential availability.
Related: ADR-011; PRD-2026-10-12-public-signed-shadow.

The shared access helper takes acknowledgement, repository visibility and signing mode.
It permits private unsigned/required mode and public required mode only. Unknown values
or missing acknowledgement fail before signing inputs, dependencies or build execution.

The web, macOS, Windows and Linux packaging jobs sign staged assets with the pinned
Minisign key after collection and before Actions upload. Public mode cannot select an
unsigned packaging lane. The shared preflight requires all Apple/Azure/Minisign secrets
before any packaging job starts. Native platform signatures and notarization are still
audited before collection; updater metadata is generated/refreshed before Minisign.

The workflow remains manual-only, read-only for repository contents and --publish=never.
The finalizer still verifies one source/version/signing set. Local helper/workflow tests
are structural and access-policy proofs, not evidence of real cross-platform signatures.
