# ADR-009: Prepare the Independent Desktop Release Channel

Status: Accepted for preparation; production cutover pending evidence.
Date: 2026-10-11
Related: PRD-2026-10-11-independent-desktop-release-preparation; ADR-006; ADR-008.

This decision extends ADR-006 and ADR-008 for release preparation only. It does not silently rewrite their
accepted identity or migration requirements. The user requested correcting the stale release surface.

The planned Desktop release repository is `defai-digital/ax-code-desktop`, with `v` tags. The existing
public updater remains on its preserved channel until signed shadow, upgrade, rollback, data/credential
continuity, exact-source CI, and human cutover evidence are accepted. Packaging metadata may describe
the future channel while publishing stays disabled. No sibling producer change is required: AX Code's
Desktop publisher and source have already been removed under ADR-008.

Desktop package versions must agree with one another, independently of the signed runtime version.
Use a new Desktop version rather than moving an existing tag. Public release candidates use an exact
stable Electron build. The readiness tool reports blockers and never changes tags, secrets, permissions,
repository visibility, release status, or the publication gate.
