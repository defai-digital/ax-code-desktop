# Internal reports

- [Desktop 7.30.14 verified publication](RELEASE-2026-11-09-v7.30.14-publication.md): signed four-platform release
  and independent public readback.

- [Desktop 7.30.14 maintenance candidate](RELEASE-2026-11-09-v7.30.14-candidate.md): branch integration, keyboard focus
  repair and bounded handle-based reads, with exact-source publication gates.

- [Scheduled task UX review and workspace completion](UX-2026-11-08-scheduled-task-ux-v2.md): current primary research,
  local scheduling clarity, stable row timing, task-first editing and the responsive-sidebar regression repair.

Engineering investigations and proposed implementation plans live here. A report is evidence or a proposal; it does not amend an accepted PRD, ADR, specification, or release authorization.

- [Workspace UX v1 implementation and verification](UX-2026-11-08-workspace-ux-v1.md): navigation hierarchy,
  panel handoffs and focus, bounded starters, project identity, retry presentation and native qualification.

- [WebAssembly speed and stability reassessment](WASM-2026-11-08-speed-and-stability-reassessment.md): no broad
  migration; diff engine release attachment merged upstream (first asset expected in AX Code v7.30.18); packaged
  trace found and fixed a 300 ms first-render delay.

- [Electron 45.2.3 stable upgrade review](ELECTRON-45-2026-11-08-stable-upgrade.md): exact-version upgrade,
  Mission Control startup adaptation, pinned SDK readback verification, and workspace/native qualification evidence.

- [macOS Swift and Electron architecture review](ARCHITECTURE-2026-11-08-macos-swift-and-electron.md): recommends
  retaining Electron for embedded WebMCP continuity, with source-backed migration risks, measured optimization work,
  and conditions for reconsidering a native macOS app.

- [Canonical diff consumer qualification](diff-qualification-20261103/README.md): isolated fixed-source WASM build,
  Pierre metadata/revert parity, browser cancellation/recovery, compute measurements and independent-install findings.

- [Selective WebAssembly assessment](wasm-review-20261103/README.md): Grok/Muse source review, current JS/WASM
  highlighter comparison, Markdown workload probes, ownership boundaries, and conditional adoption gates; no migration implemented.

- [Markdown Worker optimization and CRLF repair](markdown-optimization-20261103/README.md): reviewed block-only
  lexing, normalized incremental offsets, isolated tokenizer lifetime, regression tests and native Worker/DOM evidence.

## Report packages

| Date       | Package                                                     | Status                                                                              |
| ---------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 2026-10-17 | [AX Code remote control](remote-control-20261017/README.md) | Research complete; architecture proposed; implementation and deployment not started |

Existing standalone reports and historical evidence packages remain in their original locations.

- [Testing and CI/CD reference review](TESTING-CICD-2026-10-19-reference-review.md): Orca, OpenCode and Hermes Agent snapshot comparison, paired local implementation and validation receipts.

- [Analysis routing and Streamlit retirement](ANALYSIS-ROUTING-2026-10-18-retirement.md): implemented, source-qualified, paired runtime/BI commits recorded.

- [Reference design comparison](DESIGN-2026-10-20-reference-comparison.md): OpenChamber, Orca, Herdr and OpenCode local
  source/image inspection plus online research; proposed supervision, recap and WebMCP outcome requirements.

- [Desktop v7.29.1 integration and bug review](RELEASE-2026-10-25-v7.29.1-review.md)

- [Desktop v7.29.1 verified publication](RELEASE-2026-10-25-v7.29.1-publication.md)

- [Desktop v7.29.2 integration and bug review](RELEASE-2026-10-25-v7.29.2-review.md)

- [Desktop v7.29.2 verified publication](RELEASE-2026-10-25-v7.29.2-publication.md)

- [Desktop v7.29.2 advisory journey investigation](REVIEW-2026-10-25-v7.29.2-advisory-journeys.md)

- [Desktop v7.30.0 integration and bug review](RELEASE-2026-10-26-v7.30.0-review.md)

- [Desktop v7.30.0 verified publication](RELEASE-2026-10-26-v7.30.0-publication.md)

- [Desktop v7.30.1 integration and bug review](RELEASE-2026-10-26-v7.30.1-review.md)

- [Desktop v7.30.1 verified publication](RELEASE-2026-10-26-v7.30.1-publication.md)

- [Latest CLI/TUI 7.30.1 runtime pin](RUNTIME-PIN-2026-10-26-v7.30.1.md)

- [Desktop memory retention investigation](memory-retention-20261026/README.md): source-backed retention findings,
  behavioral reproductions, prioritized improvements and remaining packaged-app measurement requirements.

- [Desktop v7.30.2 integration and bug review](RELEASE-2026-10-26-v7.30.2-review.md)

- [Desktop v7.30.2 verified publication](RELEASE-2026-10-26-v7.30.2-publication.md)

- [Missing AX Trust provider setup: root cause and repair](BUG-2026-10-26-ax-trust-provider.md)

- [AX Wiki documentation contract and viewer export failure](WIKI-2026-10-26-ax-wiki-contract-and-viewer-export.md):
  verified stale/false generated claims, the minimal `Invalid graph text` reproducer, Desktop maintenance/viewer
  failure classification, and the separate runtime handoff.

- [Desktop v7.30.3 verified publication](RELEASE-2026-10-27-v7.30.3-publication.md)

- [AkiTTY Web source migration](AKITTY-WEB-2026-10-30-source-migration.md): pinned canonical source import and validation evidence.

- [AX Code Desktop 7.30.4 publication](RELEASE-2026-10-30-v7.30.4-publication.md): canonical AkiTTY Web, three fixes and verified four-platform publication.

- [Desktop v7.30.5 verified publication](RELEASE-2026-10-30-v7.30.5-publication.md)

- [Desktop v7.30.6 verified publication](RELEASE-2026-10-30-v7.30.6-publication.md)

- [Scheduled tasks design and flow review](SCHEDULED-TASKS-2026-10-31-design-review.md): runtime and Desktop
  scheduler review with two independent CLI reviewers, the bugs fixed in both repositories on 2026-10-31, and a
  prioritized plan (state-model reasons, lastRun on Info, event-driven cache, seriesID, runtime-owned scheduler boot).

- [Desktop v7.30.7 verified publication](RELEASE-2026-10-31-v7.30.7-publication.md)

- [Desktop v7.30.8 verified publication](RELEASE-2026-10-31-v7.30.8-publication.md)

- [Desktop v7.30.9 verified publication](RELEASE-2026-10-31-v7.30.9-publication.md)

- [Desktop v7.30.10 verified maintenance and publication](RELEASE-2026-11-01-v7.30.10-publication.md)

- [Desktop v7.30.11 verified maintenance and publication](RELEASE-2026-11-01-v7.30.11-publication.md)

- [Latest CLI/TUI 7.30.14 runtime pin](RUNTIME-PIN-2026-11-01-v7.30.14.md)

- [Desktop v7.30.12 verified maintenance and publication](RELEASE-2026-11-02-v7.30.12-publication.md)

- [Canonical diff WASM tarball delivery repair](diff-delivery-20261103/README.md).

- [AX Code Desktop 7.30.13 verified publication](RELEASE-2026-11-03-v7.30.13-publication.md).
