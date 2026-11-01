# AkiTTY Web source contract v5

Status: Accepted by the maintainer's update instruction ("upgrade to use akitty v1.3.0"), 2026-11-01.
Decision: [ADR-024](../adr/ADR-024-consume-akitty-web-source.md).
Supersedes: The source pin in [v4](SPEC-2026-10-31-akitty-web-source-v4.md) only.

1. Consume release `v1.3.0` from defai-digital/akitty at commit `4daf16ce6cbb394a325b0f706779600bba045a83` (annotated tag
   `v1.3.0`), subdirectory `packages/akitty-web`.
2. The release changes nothing under `packages/akitty-web`: the Web package manifest still declares `0.5.2` and every
   imported file keeps the hash recorded for v1.2.5 (`git diff v1.2.5..v1.3.0 -- packages/akitty-web` is empty). The
   release carries the macOS host's OSC 7501 program activity reports, the Agent Overview changes, the opt-in
   `akitty-agent` local request client, the bounded event timeline and the release signing checks; none of it is Web
   package source. Record the new commit and release tag in `SOURCE.json`; do not relabel upstream package contents.
3. Preserve v4's import scope, workspace packaging, hash verification, app-origin wasm, attribution and validation
   requirements unchanged.
4. Validation: `scripts/verify-source.mjs` reports the imported files verified at the new commit; the akitty-web vitest
   suite and the root boundary, typecheck and lint gates pass. There is no new regression to verify.
