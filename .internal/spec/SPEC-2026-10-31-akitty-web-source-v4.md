# AkiTTY Web source contract v4

Status: Accepted by the maintainer's update instruction ("the akitty is at v1.2.5 now, should also update the akitty web"), 2026-10-31.
Decision: [ADR-024](../adr/ADR-024-consume-akitty-web-source.md).
Supersedes: The source pin in [v3](SPEC-2026-10-31-akitty-web-source-v3.md) only.

1. Consume release `v1.2.5` from defai-digital/akitty at commit `a1354122902cff10cf0f342b4f8041d68f09ed5a`, subdirectory `packages/akitty-web`.
2. The upstream Web package manifest still declares `0.5.2`; the release changes only `lib/terminal.ts` and
   `lib/hotpath.test.ts`. Preserve that package version and record the repository release tag in `SOURCE.json`; do
   not relabel upstream package contents.
3. Preserve v3's import scope, workspace packaging, hash verification, app-origin wasm, attribution and validation
   requirements unchanged.
4. Verify the imported regression: a scrollbar fade superseded by renewed activity or by the opposite fade is
   cancelled, so an older animation never dims or hides an active scrollbar, and a pending fade is cancelled during
   cleanup (upstream `hotpath.test.ts`, "renewed activity supersedes fadeInScrollbar / fadeOutScrollbar").
