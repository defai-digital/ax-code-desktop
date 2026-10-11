# SPEC: Independent Desktop Release Preparation

Status: Accepted for preparation; signed release and migration evidence pending.
Related: ADR-009; SPEC-2026-09-02-release-migration-and-rollback.

1. Record the future repository, tag prefix, and required gates in the release policy's `cutover` section.
2. Preserve the active identity/updater and shadow-only publication guard until qualified cutover.
3. Build candidates with future repository metadata. Do not expose credentials to renderer or user data.
4. All four Desktop manifests share one SemVer. Runtime/SDK pins remain independently exact and verified.
5. Read-only preflight inspects Git state, candidate tag/release collisions, CI secret names, exact-source
   CI, and checked-in policy. Secret values are never read, copied, logged, or saved.
6. Only an absent remote tag is eligible for a future release. Never overwrite `v7.24.4` or prior artifacts.
7. Run private unsigned shadow packaging first. Signed platform artifacts, real upgrade/rollback and
   continuity evidence, and human acceptance are still required; an unsigned success is insufficient.
