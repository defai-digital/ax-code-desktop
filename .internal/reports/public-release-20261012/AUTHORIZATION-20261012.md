# Explicit Desktop Publication Authorization

On 2026-10-12 UTC the user explicitly authorized publishing the Desktop public release. This confirms the earlier public-release authorization and authorizes the independent updater/policy cutover, exact-candidate signed release publication, authenticated R2 staging and Cloudflare activation after native qualification. No new permission question is required.

The authorization does not certify missing signatures or migration tests. ADR-012 preserves those gates. No AX Code repository workflow or gateway is modified. A historical migration baseline was independently verified against GitHub asset hashes and the pinned Minisign key, then copied into an unpublished Desktop draft for repository-scoped CI access. The draft must never be published as a product release.

Local checks: 128 root script tests passed; four PowerShell-only tests were skipped on macOS. Fifteen focused updater and installed-ASAR smoke regressions passed. Boundary, release-contract, runtime-pin and workflow syntax checks passed. Hosted native installation receipts are still required before activation.
