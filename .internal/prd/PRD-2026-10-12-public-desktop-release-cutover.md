# Public Desktop Release Cutover

Status: Accepted by explicit user publication authorization on 2026-10-12 UTC.

Publish Desktop 7.24.5 independently at `defai-digital/ax-code-desktop` and the existing path-scoped download gateway. The user repeated authorization to publish; no additional approval is required. Preserve product name, application ID, data locations, credential storage, pinned Minisign key, Apple identity and Windows publisher. Do not change AX Code source or infrastructure.

Before serving installers, require exact-source CI, signed cross-platform artifacts and native installation/upgrade/rollback/profile continuity receipts. Use authenticated, hash-pinned, Minisign-verified historical Desktop 7.10.2 installers as the migration baseline. Native qualification is isolated to disposable GitHub-hosted runners. Publish only the exact artifact inventory reviewed against those receipts.
