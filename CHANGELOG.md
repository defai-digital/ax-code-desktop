# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

## [1.1.2] - 2026-06-14

- Desktop: fixed Electron desktop update detection so the local desktop shell uses the native updater instead of the web update path.
- Desktop: normalized OS open-project paths before matching existing projects, preventing duplicate handling for equivalent dropped folder paths.

## [1.1.1] - 2026-06-14

- Desktop: added macOS and Windows OS shell handling so dropping a folder onto AX Code Desktop can add or activate that project.
- UI: fixed first-run provider loading and improved project knowledge detection for AGENTS.md files.
- Tests: kept the Electron open-path coverage compatible with the repository's Bun/Vitest test runner split.

## [1.1.0] - 2026-06-14

- Desktop: made the Electron shell the default desktop runtime and removed the legacy Tauri shell.
- Desktop: added VS Code-style zoom controls to the Electron View menu.
- UI: added the AutomatosX theme defaults and aligned add-provider and scrollbar highlights with the active theme color.
- Runtime: fixed desktop event delivery, SSH cleanup, and mini-chat hand-off reliability.

## [1.0.1] - 2026-06-12

- UI: added session activity badges, permission notifications, done-not-committed prompts, diff comment summaries, and loading/error polish for desktop workflows.
- Security: hardened AX Code integration startup/proxy handling and desktop-native path boundaries.
- Windows: corrected session sorting and async file reads in the desktop server proxy.

## [1.0.0] - 2026-06-11

- Desktop: hardened updater error handling, sidecar shutdown, resource path validation, and packaged search paths for the first stable AX Code Desktop release.
- Server: preserved leading slashes in file-search requests so desktop search endpoints resolve correctly in packaged builds.

## [0.12.1] - 2026-06-11

- Desktop: restored the leading slash in the packaged health-check URL so the desktop boot probe calls `/api/global/health` correctly.

## [0.12.0] - 2026-06-10

- Desktop: tightened the AX Code runtime boundary with shared endpoint contracts, SDK version gates, and runtime readiness forwarding.
- Server: tracked SDK handle exits and surfaced runtime readiness state through the desktop server health path.
- Performance: reduced desktop runtime overhead and moved integration paths toward the public AX Code UI/API surface.
- Internal: added boundary-hardening checks and planning docs for search index ownership and desktop runtime consolidation.

## [0.11.1] - 2026-06-08

- Config: reload providers, agents, commands, and skills in the background so settings changes no longer block the UI.
- Config: added shared background reload handling and route coverage for non-blocking AX Code config refreshes.

## [0.11.0] - 2026-06-08

- Desktop: isolated the managed AX Code runtime behind desktop-only bridge headers and hardened server access against browser-origin requests.
- Desktop: added startup diagnostics for packaged server failures, including manifest checks, executable checks, port checks, and log tailing.
- Release: added a packaged Electron smoke test gate so desktop release builds verify app startup before publishing.

## [0.10.2] - 2026-06-08

- UI: removed the remaining CSS mask rendering paths from scroll-shadow and reveal surfaces to avoid masked rendering artifacts.

## [0.10.1] - 2026-06-08

- Desktop: isolated the bundled web server into an Electron `utilityProcess` and moved renderer hot paths off unbounded synchronous work.
- Desktop: packaged the Electron server process explicitly and waits for graceful server shutdown before quit.
- Git/Remote SSH: hardened remote command probing by shell-quoting command names before execution.
- Sync/UI: kept sessions with pending questions visible while trimming event windows and bounded long-running in-memory Maps.
- CI: split Windows release builds by architecture to avoid cross-architecture native module reuse.

## [0.10.0] - 2026-06-08

- Security: removed browser/server voice, TTS, STT, and microphone permission surfaces from AX Code Desktop.
- Security: removed built-in Cloudflare/ngrok public tunnel provisioning and related CLI, settings, docs, and server routes.
- SDK: refreshed the vendored AX Code JavaScript SDK from `defai-digital/ax-code` and kept desktop integration on the current v2 app API.
- Desktop: completed the AX Code Desktop naming cleanup, English-only UI cleanup, and canonical AX Code package usage for remote SSH installs.
- Release: added Windows arm64 packaging support and per-architecture update manifest merging.

## [0.9.2] - 2026-06-07

- Release: moved minisign signing into the GitHub release workflow, pinned the release public key, and requires signature coverage before publishing release drafts.
- Desktop: refreshed the Windows icon asset used by Electron packaging.
- Docs: consolidated desktop documentation around the maintained web and Electron surfaces, including release, install, proxy, tunnel, and security guidance.

## [0.9.0] - 2026-06-06

- Release: added a guarded GitHub release publishing script with local validation, tag creation, workflow watching, and optional minisign signature upload.
- Release: documented minisign key generation, artifact signing, and the GitHub publishing workflow.
- Branding: refreshed web favicon and logo assets, including a 512px touch icon.

## [0.8.0] - 2026-06-06

- Git: surface fetch errors when resolving an existing remote branch instead of silently swallowing them.
- Settings: align settings copy with desktop support status.
- Cleanup: remove unused mobile context usage view, unused git sync translations, and redundant code paths.

## [0.7.0] - 2026-06-06

- Runtimes: removed the unsupported VS Code extension and mobile/PWA runtimes — the app now targets the desktop and web experiences only, dropping the associated dead code, layouts, and update branches.
- Git: clarified push behavior and removed the implicit auto-push of commits and branches.
- Docs: rewrote the README around desktop downloads and added direct release download links.
- Internal: centralized viewer-mode, browser-voice, and git-conflict preferences, moved legacy settings resources, and removed unused exports/parameters and stale comments.

## [0.6.6] - 2026-06-06

- Release: macOS desktop artifacts are now Apple Silicon only; release, smoke, Electron updater, and legacy Tauri updater manifest paths no longer build or require macOS x64 artifacts.
- Desktop/Windows: rebuilt the Windows app icon as a 256x256 ICO so electron-builder can produce the unsigned Windows installer and portable zip.

## [0.6.5] - 2026-06-06

- Branding: aligned the settings source namespace, notification fallbacks, issue template text, About dialog title, and theme metadata with AX Code Desktop while preserving legacy compatibility paths.

## [0.6.4] - 2026-06-06

- Release: fixed the desktop packaging pipeline — macOS and Windows builds now package correctly (electron-builder config and Windows binary resolution), and npm registry publishing is opt-in and non-fatal so it no longer blocks releases.

## [0.6.3] - 2026-06-06

- Release: the release workflow now skips signing, notarization, and npm publish gracefully when their secrets aren't configured, so a release still publishes unsigned desktop artifacts and the npm tarball instead of failing.

## [0.6.2] - 2026-06-05

- Chat: added an execution-mode selector (Manual / Autonomous / Supervised long-run) to the composer toolbar.
- Desktop: the in-app updater now uses AX Code's own release channel instead of surfacing inherited package metadata and release notes.
- Updates: the web/CLI update source is now configurable via env and no longer defaults to inherited upstream endpoints; with nothing configured it reports no update without phoning home.
- Desktop/Windows: added a portable zip build alongside the installer, and renamed the published npm tarball to ax-code-web.
- Chat: fixed a scroll-spy bookkeeping leak that retained detached nodes.

## [0.6.1] - 2026-06-05

- Desktop: renamed the packaged app to AX Code Desktop and removed the startup splash window.
- Desktop: fixed packaged startup failures caused by missing bundled server assets and JSONC parser internals.
- Chat: reduced send latency by lowering the upstream SSE reconnect delay.
- Sync: fixed relative changed-file path matching and an upstream SSE reader leak.

## Pre-Rebrand History

Earlier upstream history is intentionally omitted from this AX Code Desktop changelog. Current release notes should describe AX Code Desktop only; legacy implementation names belong in compatibility notes when they are required for paths, environment variables, or endpoint names.
