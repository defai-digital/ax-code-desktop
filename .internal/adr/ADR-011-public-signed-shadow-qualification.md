# ADR-011: Public Signed Shadow Qualification

Status: Accepted for qualification; official publication pending signed evidence.
Date: 2026-10-12 UTC.
Decision owner: user, through public-release approval and explicit signature requirements.
Related: PRD-2026-10-12-public-signed-shadow; ADR-010; failed Actions job 114634431835.

The repository's public visibility is observed through GitHub API and the failed
workflow's event payload. This agent did not change repository visibility. Supersede
ADR-010's private-source assumption for qualification only: support public repositories
in required-signature shadow mode and retain private-only unsigned mode.

Require explicit shadow acknowledgement, known visibility and a valid signing mode.
Every staged package/update file must receive a verified Minisign signature before
Actions artifact upload. Keep Apple Developer ID/notarization and Windows Authenticode
checks before collection/upload. Repeat detached verification in the finalizer.

This permits signed candidate artifacts in a public repository. It does not claim an
official release, grant contents-write, enable updater/download serving, waive migration
gates, export local private keys or change budgets. Rollback is to disable the manual
workflow; public unsigned mode remains rejected by the shared access-policy helper.
