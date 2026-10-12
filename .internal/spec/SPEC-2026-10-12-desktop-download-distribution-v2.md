# Desktop Download Distribution v2

Status: Accepted for implementation preparation; publication remains disabled.
Supersedes: v1 implementation details only; ADR-010 and release gates remain active.

The user authorized implementing the proposed Desktop download path and will handle
DNS. This implementation owns a separate path-scoped Worker and R2 binding in this
repository, without changing AX Code's gateway or checkout. DNS alone does not
configure the HTTP route: the operator must attach this Worker to
`download.automatosx.com/ax-code-desktop/*` in the existing Cloudflare zone.

Implement Bash/macOS/Ubuntu and PowerShell/Windows x64 bootstrap installers. Embed
the existing Minisign public key and pin SHA-256 for upstream Minisign 0.12 verifier
archives, so a fresh machine does not require Homebrew, Node or a preinstalled
Minisign. Verify each verifier archive before extracting/executing it. The upstream
archive digests were independently retrieved during implementation; update pins
through reviewed source changes only.

Use a signed `latest.txt` containing one stable `vX.Y.Z` tag, versioned signed
`release.tsv` containing source SHA and the four installer filenames/size/digests,
and signed `release-ready.txt` binding tag, SHA and manifest digest. Installers
validate every manifest row and refuse unsupported targets, missing signatures,
size/hash mismatch or an inconsistent marker before installation.

Local `prepare` is permitted while shadow-only and never publishes or signs.
It requires Minisign-verified input packages and update metadata, produces unsigned
bootstrap/manifest/inventory/marker/pointer files for operator signing, and refuses
symlinks or pre-existing output. `verify` validates the entire signed inventory.
`upload` additionally requires approved release policy and a signed qualification
record for exact source/version, all five cutover gates, and all four platform lanes.
No signature verification or release-policy bypass flag is provided.

The mirror uploads immutable version objects and checks anonymous public bytes;
writes the signed readiness marker last in that version; then switches root installer
aliases and finally the signed latest pointer. Root pointer/signature publication is
not transactional in R2: transient mismatches fail closed and can be retried; existing
version-qualified assets remain immutable. Generic updater activation is a separate
cutover step and is not enabled by this implementation.

The Worker defaults to disabled public access. Serve only allowlisted Desktop keys,
GET/HEAD requests, conditional ETags and single byte ranges. Immutable version
objects use long caching; mutable root aliases and error responses use no-store.
The gateway deployment and first signed install/upgrade/rollback acceptance remain
external qualifications; tests must distinguish mocks from native OS evidence.
