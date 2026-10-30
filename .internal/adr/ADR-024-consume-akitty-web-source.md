# ADR-024: Consume AkiTTY Web from its canonical repository

Status: Accepted by maintainer instruction, 2026-10-30.
Requirements: [AkiTTY Web source v1](../prd/PRD-2026-10-30-akitty-web-source-v1.md).
Supersedes: ADR-023 D1 and D3 and its naming amendment only as to source ownership and synchronization.

AkiTTY owns the terminal implementation at defai-digital/akitty/packages/akitty-web. Desktop consumes an exact committed snapshot because the private package is not published. The existing workspace package name and public exports remain the integration seam. Desktop owns only its workspace packaging and provenance verification; terminal fixes belong in AkiTTY and arrive by reviewed snapshot updates.

Keep the upstream implementation, tests, declarations, build script, licenses and provenance byte-identical to the pinned commit. Record SHA-256 hashes in SOURCE.json and verify them during package typecheck. Adapt package.json to pnpm catalog dependencies; do not import the upstream npm lockfile. Ordinary builds require no upstream checkout or network. Update snapshots deliberately and run the Desktop gates. Preserve ADR-023's wasm provenance and attribution requirements.

The new upstream agent APIs are available exports. This import does not register tools or grant terminal execution access. The macOS native application remains separate.
