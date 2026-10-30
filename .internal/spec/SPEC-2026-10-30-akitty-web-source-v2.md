# AkiTTY Web source contract v2

Status: Accepted by the maintainer's explicit v0.12.0 update instruction, 2026-10-30.
Decision: [ADR-024](../adr/ADR-024-consume-akitty-web-source.md).
Supersedes: The source pin in [v1](SPEC-2026-10-30-akitty-web-source-v1.md) only.

1. Consume release `v0.12.0` from defai-digital/akitty at commit `6c6052f74bd83032933f153b9940a331f794543f`, subdirectory `packages/akitty-web`.
2. The upstream Web package manifest still declares `0.5.0`. Preserve that package version and record the distinct repository release tag in `SOURCE.json`; do not relabel upstream package contents.
3. Preserve v1's byte-identical import, workspace packaging, hash verification, app-origin wasm, attribution and validation requirements. The native macOS application is outside this import.
4. Verify the imported regressions for complete grapheme clusters, preserved blank cells, safe surrogate truncation and cached-row rendering. Agent API availability does not register tools or grant access.
