All verification done read-only with search tools (no writes, no builds). Subagents and shell were unavailable in this session, so counts were spot-verified via targeted reads; claims I could not re-count are marked.

# PART 1 — AX Code vs Orca & OpenCode

## Corrections to the prior scoring's gap list
- **Confirmed**: `ChatInput-impl.tsx` ≥4,854 lines; `FilesView-impl.tsx` ≥3,852; `electron/src/main.js` ≥3,762; `web/server/lib/git/service.js` ≥4,952 (offset-probed). `-impl` split cosmetic: `ui/src/components/chat/ChatInput.tsx` is a 1-line re-export. No Playwright config exists anywhere in `ax-code-desktop` (only an icon SVG). Source-text pattern tests confirmed: `ui/src/components/ui/__tests__/scroll-shadow-css.test.ts:6-8`, `components/layout/axLayout.test.ts:1`, `lib/needsYou.test.ts:87-89`, `session/DirectoryExplorerDialog-browse.test.ts:6`. `runAsNode: true` confirmed (`electron/electron-builder.yml:22`). Updater frozen pending ADR-009 cutover (`electron-builder.yml:194-199`, `AGENTS.md` Phase 3).
- **Corrected**: (a) "no explicit sandbox" is wrong for guests — `electron/src/webview-policy.js:51` forces `sandbox: true` on attached webviews, plus src/partition allowlist (:19-32) and popup deny (:69); the *main renderer* still lacks `sandbox`. (b) CSP is worse than claimed: `web/server/lib/security/response-headers.js:47` allows `'unsafe-eval'` **and** wildcard `connect-src 'self' ws: wss: http: https:`. (c) Packaging: macOS arm64 (`electron-builder.yml:87-91`) and Windows x64 (:116-123) only, but Linux AppImage+deb exist (:156-159); notarization and Azure-KV signing are configured (:109, :130). (d) The Electron layer is untyped CJS but *modular* (~90 modules, each with a `.test.mjs`); only `main.js` is a monolith. (e) "58 files >1k lines" — not re-countable read-only; the named four are confirmed.

## Desktop gap table

| Capability | AX state (evidence) | Reference evidence | Impact |
|---|---|---|---|
| E2E + visual regression | **None** (no playwright config in repo) | Orca `tests/e2e/*.spec.ts` 100+ files + `tests/playwright.config.ts`; OpenCode `packages/app/e2e/**`, `component-tests/` | Testing 7→9; release safety |
| Perf contracts in CI | None desktop-side | Orca `.github/workflows/performance-contracts.yml`, `terminal-perf.yml`; OpenCode `packages/app/e2e/performance/**` (timeline/terminal/startup benchmarks) | Perf 7→8.5 |
| Worktree-as-core-unit | Create-only action (`ui/src/components/CommandPalette.tsx:265`, `lib/worktreeSessionCreator`) | Orca 20+ `worktree-*.spec.ts` incl. lineage/lifecycle; OpenChamber `web/server/opencode-worktree-readiness.test.js` | Supervision +1 |
| Agent dashboard pop-out | Absent (single window + tray `electron/src/mini-chat-tray-action.js`) | Orca `src/main/window/dashboard-popout-window.ts`, `src/main/ipc/dashboard-popout.ts`, `components/dashboard/dashboard-subagent-cards.ts` | Supervision 8→9 |
| Mobile companion | Absent | Orca `mobile/package.json` (Expo + xterm webgl); OpenChamber `packages/mobile` | Breadth (long-term) |
| GitLab/Jira/Linear | GitHub-only (`web/server/lib/github/`, `GitHubBoardView.tsx`) | Orca `web-gitlab-api.ts`, `jira-*`, `linear-format.ts`; OpenChamber `server/lib/{gitlab,linear}` | Breadth 9→10 |
| Browser pane | Present via webview+WebMCP (`electron/src/desktop-webmcp-browser.js:261-262`) | Orca `src/main/runtime/browser/**` + `browser-host/**` (screencast, tunnels, profiles, lease fencing) | Parity-ish; depth gap |
| Typed IPC | JSON allowlist, untyped (`electron/src/desktop-ipc-contract.json`, `preload-ipc-policy.js`) | OpenCode `desktop/src/main/desktop.ts:1,17` (Effect layers), `renderer/ipc-client.ts:20` | Arch 6→7.5 |
| Design system + Storybook | None | OpenCode `packages/storybook/.storybook/main.ts`; Orca `docs/STYLEGUIDE.md` lint-gated | UX/Arch |
| Locales | 13 (`ui/src/lib/i18n/messages/*.json`) | OpenCode ~63 (`packages/ui/src/i18n/*.ts`); Hermes 9 + RTL + completeness tests | UX |
| Monoliths | 4 files ≥3.7k lines (above) | OpenCode layered `desktop/src/main/windows/*`; Hermes ratchets files ≤2,000 lines (`scripts/code_health`) | Arch |

## TUI gap table (AX `packages/ax-code/src/cli/tui` vs OpenCode `packages/tui`)
Stacks: both SolidJS; OpenCode on `@opentui/solid`+`effect`+`@opentui/keymap` (`tui/package.json:61-69`), AX a custom renderer (`renderer.ts`, `worker.ts`, `solid-js` dep at `packages/ax-code/package.json:159`). **Correction to "TUI not scored": AX TUI is well tested** — `packages/ax-code/test/cli/tui/` holds 100+ files + snapshots (the earlier "zero tests" read was wrong; tests live in a separate tree).

| Capability | AX evidence | OpenCode evidence | Verdict |
|---|---|---|---|
| Session switching / multiproject | `component/dialog-session-list.tsx`, `dialog-workspace-list.tsx`, `util/session-tree.ts` | `test/session-group-navigation.test.tsx`, `session-home.test.tsx` | Parity |
| Sub-agent view | `routes/session/subagent-status-panel.tsx`, `child.ts`, `ensemble.tsx` | — | **AX ahead** |
| Diff/review | `component/dialog-diff-viewer.tsx`, `turn-changed-files-row.tsx`, `rollback.ts` | `test/added-patch.test.ts`, `app/e2e/performance/patch-groups` | Parity; AX lacks hunk-level TUI staging evidence |
| Permission UX | `routes/session/permission.tsx`, `permission-command-view-model.ts`, `util/permission-submit-latch.ts` | `test/util/permission.test.ts`, `keymap-scope.test.tsx` | Parity |
| Themes | `dialog-theme-list.tsx`, `chrome-theme-tokens` test | `@opencode/theme` pkg, `test/theme/v2/*` (schema+migration), token-role rules in `tui/AGENTS.md` | AX behind (no user-theme schema/migration) |
| Keybinds | `context/keybind`, `util/keybind`, `test/keybind.test.ts` (repo root) | `@opentui/keymap`, `config/keybind` export, `plugin-keymap.test.tsx`, scopes | AX behind (no scoped/plugin keymaps) |
| Mouse | `ui/dialog-select.tsx:487`, `ui/link.tsx:24` | `session-wheel-focus.test.tsx`, `selection-copy-on-select` | Parity |
| Long-session perf | `coalesce-stream-events.ts`, `stream-paint.ts`, `step-windows.ts`, `dialog-select-virtual.tsx`, `performance-criteria.ts` | `session-mount-budget.test.tsx`, `simulation/semantics.test.ts`, benchmark scripts | AX criteria exist but **no CI benchmark harness**; behind |
| Supervision | `workflow-dashboard.ts`, `dialog-scheduled-task.tsx`, `dialog-goal.tsx`, `dialog-quality.tsx`, `dre.tsx` | — | **AX ahead** |
| Plugin surface | `renderer-contract.ts:77` `extension.plugin-slots`, `performance-criteria.ts:95` | `plugin/discovery` export, `feature-plugins/`, `./mini` embeddable TUI, 8 plugin tests | AX behind (slots designed, no discovery/3rd-party surface) |
| Dev harness | — | `dev:live` against real server + TUI stories (`OPENCODE_STORY`, `tui/AGENTS.md`) | AX behind |
| Orca CLI supervision | AX equivalents: `run`, `schedule`, `watch-comments` tests (`test/cli/`) | Orca `src/cli/`: `agent-launch-*`, `automation-*` (scheduled runs), `index-worktree-create-{linear,jira,gitlab}`, `orca serve`, host selectors | Orca's automation CLI is the model to match |

## Ranked proposals
1. **Playwright e2e bootstrap** (desktop). 10 journeys: boot, add project, send prompt, approve permission, stage hunk, create worktree, packaged smoke. Files: `desktop/e2e/`, reuse `electron/src/*.test.mjs` seams. Effort L. Testing +1.5, Release +1. Dep: none. Risk: flaky CI cost.
2. **CSP + sandbox hardening** (desktop). Drop `'unsafe-eval'`/wildcard `connect-src` in `web/server/lib/security/response-headers.js:47`; add `sandbox:true` to main window or document why preload forbids it. S/M. Security 8→9. Easy win.
3. **Kill the four monoliths** (desktop). Split `git/service.js` by domain (status/diff/ops), `ChatInput-impl` into composer modules, `main.js` orchestration into existing module pattern; delete cosmetic `-impl` wrappers. M. Arch +1.
4. **Schema-typed IPC** (both). Replace `desktop-ipc-contract.json` with generated TS types from a single schema (Effect-Schema or zod), consumed by `preload-ipc-policy.js` and web routes; SDK publishes the same schema. Runtime/SDK releases the contract first. M/L. Arch +1, Security +0.5.
5. **Worktree-centric supervision** (both). Runtime: expose worktree list/status/lineage via SDK server API. Desktop: worktree rail + per-worktree agent cards, inbox keyed by worktree. L. Supervision +1, Breadth +0.5. Dep: SDK release.
6. **Agent dashboard pop-out window** (desktop). Reuse `desktop-window-chrome.js` + `supervision-fsm.js`; second `BrowserWindow` with dashboard route. M. Supervision +0.5.
7. **TUI plugin surface GA** (ax-code). Implement discovery behind `plugin-slots` (`renderer-contract.ts:77`), keymap scopes, docs + `test/cli/tui` fixtures. M. Breadth/Arch.
8. **TUI perf benchmark CI** (ax-code). Execute `performance-criteria.ts` workloads in CI with budgets (OpenCode `session-mount-budget` model). M. Perf +1.
9. **Updater cutover + update e2e** (desktop). Finish ADR-009/012 gates; add Hermes-style `e2e/update/` suite before cutover. M. Release +1.5.
10. **GitLab/Linear task board** (both). Generalize `GitHubBoardView.tsx` + `web/server/lib/github/`; hosting data must come from runtime/SDK, not desktop git code. M/L. Breadth +0.5.
11. **Storybook + style lint gate** (desktop). Token lint à la Orca `check:code-quality:changed`. M. UX/Arch +0.5.
12. **Ban source-reading tests** (desktop). Rewrite the 4 confirmed pattern tests as behavior tests; adopt Hermes rule verbatim ("behaviour contracts, never change-detectors", `hermes-agent/AGENTS.md`). S. Testing integrity.
13. **Locale completeness + pseudo-locale** (desktop). Add `overlay-completeness.test.ts` pattern (Hermes) and `pseudo-localization` (Orca `src/renderer/src/i18n/pseudo-localization.ts`). S. UX.

**Sequencing** — Phase 1 (2 wks): #2, #12, #1 bootstrap, #9 cutover, start #3. Phase 2 (6 wks): #4 (SDK contract first), #5 (runtime API → desktop UI), #6, #8, #10 data contracts. Phase 3 (later): #7, #11, #13, mobile decision. Cross-repo rule: every runtime/SDK contract (#4/#5/#10) ships as a published SDK version before desktop consumes it (`ax-code-desktop/AGENTS.md` hard rules).

**Do NOT copy (Orca/OpenCode)**: Orca's cloud relay fleet (`cloud-deploy-relay-*`, 30+ workflows) and self-owned mobile app — remote execution belongs to runtime/AX Agent, not desktop; Orca's Cursor-dashboard cookie scraping (`src/main/rate-limits/cursor-session-token.ts`) — ToS risk; OpenCode's ~63 hand-maintained locale files — cost without reach; a full Effect rewrite — adopt schema-typing (#4) instead; Orca's Monaco embedding — AX's diff-first views suffice.

# PART 2 — Hermes & OpenChamber

## 1. Upstream drift (OpenChamber → AX Desktop)
| Feature | Status | Evidence (OC / AX) | Port? |
|---|---|---|---|
| Multirun + fusion | **Present** | `packages/ui/src/components/multirun/MultiRunFusionDialog.tsx:36` / `ui/src/components/MultiRunWindow.tsx`, `supervision/MultiRunCompare.tsx:119` | Verify parity only |
| SSH manager | **Missing** | `web/src/api/managed-ssh.ts` / no `*ssh*` in desktop packages | Port runtime-first (execution host = runtime boundary) |
| Spaces + worktree views | **Missing** | `ui/src/lib/spaces/**` (spaces-store, space-creation, space-repair, archives, network), `server/opencode-worktree-readiness.test.js` / AX has only `session-folders` + palette create | Port (folds into P1 #5) |
| Agent manager | Present-but-different | `ui/src/components/views/agent-manager/**` / `ui/src/components/sections/agents/AgentsPage.tsx:208` (subagent modes) | No |
| Notification host routing | Present | `web/server/lib/notifications` / AX same dir; Hermes dedup better (below) | Partial |
| Mini-chat | Present | `web/src/mini-chat-main.tsx` / `electron/src/mini-chat-tray-action.js` | No |
| PR view | Present | `web/src/api/source-control.ts` / `views/git/PullRequestSection.tsx` | No |
| Browser panel | Present | `web/server/lib/browser-control` / `electron/src/desktop-webmcp-browser.js` | No |
| Mobile pipeline | **Missing** | `packages/mobile`, `web/src/mobile-main.tsx`, `mobile-ci.yml`, `mobile-release.yml` | Defer (needs runtime remote APIs) |
| VS Code extension | Missing in desktop; exists runtime-side | `packages/vscode`, `vscode-extension.yml` / `ax-code/packages/integration-vscode` | No desktop port |
| Release smoke + notarization verify | **Missing** | `release-desktop-smoke.yml:134`, `release.yml:224` ("Verify signature + entitlements + notarization") / AX: notarize configured but signed shadow evidence pending (`AGENTS.md`) | **Adopt now** |
| Dictation | Missing | `web/server/lib/dictation` / none | Optional |
| Message search / queue | Missing | `web/server/lib/{message-search,message-queue}` / none | Port search (runtime query API needed) |
| Guests (shared workspaces) | Missing | `ui/src/lib/guests/workspace.ts` | Skip — auth belongs to AX Trust |
| Anti-slop lint rules | Missing | `tools/oxlint/anti-slop/rules` (17 rules) | Adopt subset |
| Direct agent-server proxy/tunnel (`opencode-proxy`, ngrok/cloudflare tunnels) | **Removed on purpose** | OC `web/server/index.js`, `ngrok-tunnel.js` / AX replaced by pinned SDK + `security/legacy-tunnel.js` | **Keep removed** — runtime boundary forbids desktop owning the agent server |

## 2. Hermes features we lack
- **Command center**: `apps/desktop/src/app/command-center/index.tsx:48` (maintenance/sessions/system/usage) + `routes.ts:68` — AX has SettingsView+quota fragments only. **Port** as a diagnostics hub reading runtime health.
- **Update e2e suite**: `e2e/update/{app-update,first-run,gates,update-concurrency}.spec.ts` + `packaged-smoke.spec.ts` — none in AX. **Port with #1/#9.**
- **MSIX + release channels**: `electron-builder.config.cjs:20-54` (storeMsix, channel, `.appinstaller` single-source publisher) — AX ships NSIS only. **Port (Phase 3).**
- **Notification registry w/ peer dedup + Linux**: `electron/notification-ipc.ts:24,35` ("Peer renderers share one OS notification") — AX lacks dedup across windows. **Port, S.**
- **OpenRPC-generated gateway contract**: `apps/shared/gateway-contract.openrpc.json` + `json-rpc-gateway.ts` — validates proposal P1 #4. **Adopt pattern.**
- **Locale completeness tests + RTL**: `src/i18n/overlay-completeness.test.ts`, `ar.ts` — AX has 13 locales, no completeness gate. **Port, S.**
- **Theme skins/accents/translucency**: `apps/shared/skin.ts`, `theme-presets.ts`, `translucency.ts` — partial port (accent tokens).
- **Cron/webhooks/messaging gateway (~20 platforms)**: root `cron/`, `gateway/run.py:362` webhook platforms — AX runtime already has scheduled tasks (`test/cli/schedule.test.ts`, TUI `dialog-scheduled-task.tsx`); messaging gateways are **AX Agent scope — skip for desktop**.
- **ACP**: `acp_adapter/` — AX runtime has ACP (`test/cli/acp.test.ts`); desktop exposure only, minor.
- **Fleet profile rail**: `e2e/fleet-profile-rail.spec.ts` — profiles-as-islands is Hermes' model; AX's project registry is the equivalent. **Skip.**
- **Preview-with-console**: parity — AX already captures console via `web/server/lib/preview/proxy-runtime.js:849-859`.

## 3. Top 10 proposals (these two sources only)
1. **Spaces→worktree view port** (both). Desktop: `ui/src/lib/spaces/` ported to consume SDK worktree API; runtime: expose worktree create/status/lineage. Contract: new SDK endpoints, released before desktop. L. Breadth+Supervision ≈ +1.2. Risk: duplicating runtime git logic — forbidden; keep all git ops behind SDK.
2. **Release smoke + notarization verification** (desktop). Add `release-desktop-smoke`-style workflow asserting signature+entitlements+notarization on artifacts. S/M. Release +1. Low risk.
3. **Update e2e suite** (desktop). Playwright against packaged builds (`update/` dir à la Hermes). M. Release+Testing +1. Dep: #1 (e2e harness).
4. **Generated typed IPC contract** (both). OpenRPC/Effect-schema single source → TS types for `preload-ipc-policy.js` + web routes + SDK. L. Arch +1.5, Security +0.5.
5. **Notification routing upgrade** (desktop). Registry + cross-window dedup + click actions + Linux backend in `electron/src/`. S. Supervision +0.5.
6. **Command-center/diagnostics view** (desktop). Maintenance/sessions/system/usage sections over SDK health endpoints. M. UX +0.5.
7. **Message search** (both). Runtime session-store search endpoint → desktop search UI. M. Breadth +0.5.
8. **SSH/remote execution** (ax-code first). Execution-host abstraction in runtime/SDK; desktop host selector later. L. Breadth +1. Risk: security surface; gate via AX Trust credentials model.
9. **i18n completeness + pseudo-locale + RTL** (desktop). Port Hermes overlay tests + Orca pseudo-localization. S. UX +0.5.
10. **Anti-slop lint subset** (desktop). 4-5 rules from `openchamber/tools/oxlint/anti-slop` (no-chained-type-assertions, require-safety-comment). S. Arch hygiene.

## 4. Do NOT copy (Hermes/OpenChamber)
- **Pets/particles/starmap/floating overlays**: `src/components/pet/**` (16+ files), `particles/particle-field.tsx`, `store/starmap.ts`, `electron/pet-overlay.ts` — pure sprawl. **Mirror warning:** AX's own TUI ships ~40 pixel-art animation scenes (`cli/tui/component/*-pixels.ts`) each with paired tests (`test/cli/tui/aurora-pixels.test.ts` …) — same class of cost; freeze and consolidate.
- **18k-line `main.ts`**: `apps/desktop/electron/main.ts` >17,900 lines confirmed (offset probe) despite Hermes' own ≤2,000-line ratchet — the cautionary tale for our `main.js`.
- **~20-platform messaging gateway + webhook adapters** — product scope for AX Agent, not Desktop; would violate the ownership boundary.
- **Python-parity test harness** (`vitest.hermes-python.ts`) — stack-specific.
- **OpenChamber mobile pipeline & guests** — need runtime remote/durable-run APIs and AX Trust authz before any desktop surface.
- **Direct agent-server proxy & ngrok/cloudflare tunnels** — deliberately removed at the fork; keep them out.