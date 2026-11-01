# AkiTTY Web source contract v3

Status: Accepted by the maintainer's update instruction ("did we update the akitty web"), 2026-10-31.
Decision: [ADR-024](../adr/ADR-024-consume-akitty-web-source.md).
Supersedes: The source pin in [v2](SPEC-2026-10-30-akitty-web-source-v2.md) only.

1. Consume release `v1.2.4` from defai-digital/akitty at commit `921efb02e3d9c929cacb0a191e0171297379853b`, subdirectory `packages/akitty-web`.
2. The upstream Web package manifest declares `0.5.2`. Preserve that package version and record the repository release
   tag in `SOURCE.json`; do not relabel upstream package contents.
3. Preserve v1's byte-identical import, workspace packaging, hash verification, app-origin wasm, attribution and
   validation requirements. The upstream browser Playwright suite (`browser/`, `playwright.config.ts`) and its
   `@playwright/test` and `vite` dev dependencies are outside this import; Desktop runs the upstream Vitest suite only.
4. Verify the imported regressions: the render loop parks while the terminal is off-screen and resumes with a full
   redraw when shown, scrollbar fades and smooth scrolls snap while hidden (the Desktop hot-path finding of
   2026-10-31), terminal resources survive reset and cleanup failures, selection, scrolling and hover state clear on
   lifecycle transitions, and event-emitter disposal is covered by its own test.
