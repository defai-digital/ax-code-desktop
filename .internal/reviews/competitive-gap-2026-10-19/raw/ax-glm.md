All evidence is gathered. Here is the complete gap review.

---

# PART 1 — Desktop + TUI gap review vs Orca and OpenCode

## 1. Verification of prior review claims

| Claim | Verdict | Evidence |
|---|---|---|
| 58 files >1,000 lines; ChatInput-impl 4.9k, git service 5k, main.js 3.8k | **Verified (spot-checked)** | `desktop/packages/ui/src/components/chat/ChatInput-impl.tsx` ≥4,864 lines; `web/server/lib/git/service.js` ≥5,000; `electron/src/main.js` ≥3,759. FilesView 3.9k not re-probed; `-impl` split confirmed cosmetic (`FilesView.tsx` re-export beside `FilesView-impl.tsx`) |
| Untyped CommonJS Electron layer | **Verified but mis-framed** | `electron/src/*.js` is CommonJS, yet it is a highly modular orchard: ~100 small modules each with `.test.mjs` (`webview-policy.js`, `desktop-renderer-protocol.js`, `runtime-auth-password.js`…) plus `desktop-ipc-contract.json`. It is not a monolith |
| `webviewTag: true` | **Verified, but policy-gated** | `electron/src/webview-policy.js:14` sets `webviewTag: true` and then forces `contextIsolation`, `nodeIntegration:false`, `sandbox:true` (lines 47–51) |
| CSP `script-src 'unsafe-inline'` | **Verified** | `electron/src/desktop-renderer-protocol.js:108` — `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'` |
| `runAsNode` fuse on, no explicit sandbox | **Verified with documented rationale** | `electron/electron-builder.yml:22` (`runAsNode: true` — packaged desktop CLI uses Electron as Node launcher); aux windows do set `sandbox:true` (`wiki-viewer.js:80`, `launch-animation-controller.js:103`, `desktop-webmcp-browser.js:260`) but the main window (`main.js:725`) does not |
| No Playwright e2e; some tests only pattern-match source | **Verified** | No `playwright.config.*` or e2e dir anywhere in `ax-code-desktop`; source-matching tests exist (`ui/.../terminal-view-source.test.ts`, `DiffView.headerLayout.source.test.ts`, `sync/pendingToastWiring.source.test.ts`) |
| Updater cutover pending; mac arm64 / win x64 only | **Verified** | `electron-builder.yml:87–91,115–118`; electron-updater wired with `autoDownload=false` + generic feed (`main.js:23,973–1028`); ADR-009/012 gates still pending per repo `AGENTS.md` |

**Stale gaps (now present):** worktrees (`ui/src/types/worktree.ts`, `lib/worktrees/worktreeManager`), multirun + fusion (`views/MultiRunWindow.tsx`, `types/multirun.ts`, `magic-prompts` "session.fusion" `MagicPromptsPage.tsx:187`), PR view (`views/git/PullRequestSection.tsx`), GitHub board (`GitHubBoardView.tsx`), hunk-level diff stage/revert (`useDiffHunkStage.ts`/`useDiffHunkRevert.ts`), command palette (`stores/useUIStore-impl.ts:579–725`), mini-chat (`web/src/mini-chat-main.tsx`, `electron/src/mini-chat-tray-action.test.mjs`), preview (`views/PreviewToggleButton.tsx`, `web/server/lib/preview/`), passkeys (`web/server/lib/ui-auth/ui-passkeys.js`), cross-session search (`ui/src/lib/search/crossSessionSearch.ts`), 13 locales (`ui/src/lib/i18n/messages/`, no RTL), tray + global quick-dispatch (`main.js:3583`, `quick-dispatch-shortcut.js`). The 76.5 score under-credits breadth; the real deficits are testing, release, arch, and supervision surfaces.

## 2. Desktop gap table

| Capability | AX state | Reference evidence | Impact |
|---|---|---|---|
| E2E + packaged-build suites | Absent (unit tests only) | Orca `tests/e2e/` ≥100 spec files (glob-capped; worktree/terminal/update suites), `playwright.config.ts`; Hermes 57 specs incl. `e2e/update/*` | Testing 7→9; regression safety |
| Perf-contract CI | Absent | Orca `.github/workflows/performance-contracts.yml`, `terminal-perf.yml`, `preflight-benchmark.yml` | Perf 7→8; catches latency drift |
| Mobile companion | Absent | Orca `mobile/` + `mobile.yml`, `mobile-android-release.yml`; OpenChamber `packages/web/src/mobile-main.tsx`, `mobile.html`, `sw.ts` (PWA) | Breadth; supervision away from desk |
| Issue-tracker integrations | GitHub only (`web/server/lib/github/`) | Orca `src/cli/jira-handler-group.ts`, `linear-handler-group.ts`, `renderer/.../web-gitlab-api.ts`; OpenChamber `web/server/lib/{linear,gitlab}/` | Breadth; linked-issue workflows |
| Agent/fleet dashboard | Absent (session sidebar only) | OpenChamber `ui/src/components/views/agent-manager/AgentManagerView.tsx`; Hermes `e2e/fleet-profile-rail.spec.ts` | Supervision 8→9 |
| Typed IPC | `desktop-ipc-contract.json` + JS | OpenCode Effect-Schema IPC, `gui-extensions/README.md` ("schemas over the bridge") | Arch 6→7; compile-time contract drift |
| Main-window sandbox | Missing on main window | OpenCode `desktop/src/main/windows/appearance.ts:45` `sandbox: true` | Security 8→8.5 |
| Extension surface | None (all built-in) | OpenCode `packages/gui-extensions/` (provides/uses/requires, stores, i18n, own tests) | Arch; ecosystem |
| Design-system + storybook | Single `ui` package | OpenCode `packages/{ui,session-ui,storybook}` | Arch, consistency |
| i18n depth | 13 locales, no RTL | OpenCode `app/src/runtime/i18n/` ~63 locales incl. `ar/he/fa` | UX reach |
| Pop-out session window | Partial (Settings/MultiRun/mini-chat/wiki only) | Hermes pop-out session windows; Orca agent dashboard pop-out | UX |
| Release channels | Single channel, gates pending | Orca `dev-channel-win-build.yml`, hourly/daily mac builds; Hermes MSIX + channels (`update-feed.cjs`) | Release 7→9 |

## 3. TUI gap table (AX Code TUI vs OpenCode TUI)

AX TUI (`packages/ax-code/src/cli/tui`, SolidJS on `ax-tui`, vendored OpenTUI per ax-code `AGENTS.md`) is strong: session list with folders/pin/rename (`component/dialog-session-list.tsx:217–339`), workspace switcher (`dialog-workspace-list.tsx`), sub-agent panel with open/stop (`routes/session/subagent-status-panel.tsx:20–46`), diff viewer (`dialog-diff-viewer.tsx`), rollback/branch/compare/execution-graph/timeline dialogs, permission UX with safe defaults (`permission-safe-default.test.ts`, `auto-accept.test.ts`), custom themes (`dialog-theme-list.tsx:24`), keybind schema with user overrides (`ui/dialog-help-view-model.ts:63`), mouse click/drag-select (`ui/image-preview-link.tsx:20–26`), image preview + sixel, i18n parity enforcement, 100+ tests under `packages/ax-code/test/cli/tui/`.

| Capability | AX TUI | OpenCode TUI evidence | Gap |
|---|---|---|---|
| Plugin/extension surface | None (commands are built-in `app-commands.ts`) | `tui/src/plugin/`, `feature-plugins/`, `plugin-{discovery,keymap,markdown,model,toast,select}.test.ts` | Real gap |
| Storybook/live fixtures | None | `feature-plugins/system/storybook` + `bun run dev:live` (opencode `AGENTS.md`) | Real gap |
| Themes | Custom-theme loading; small built-in set | 35 JSON themes + discovery + v1 migration (`tui/src/theme/assets/*.json`, `discovery.ts`) | Partial |
| Keybind scopes | Single global schema | `keymap-scope.test.tsx`, `keybind.test.ts` | Minor |
| Perf gates | `performance-criteria.ts` exists but gates are `"manual"` (lines 13–60) | `session-mount-budget.test.tsx` automated | Promote to automated |
| Multi-session supervision | One session per instance; child/activity browser (`activity-browser.ts`, `child.ts`) | `panel.test.ts`, session groups (`session-group-navigation.test.tsx`) | Both weak; AX fine for now |
| Editor integration | `util/editor.ts` (open-in-editor) | `editor-zed.ts`, `editor-zed-sqlite.*.ts` (Zed Collab) | Nice-to-have |
| Attention/audio | `audio-notify.ts`, OSC passthrough | `attention-sounds.{bun,node}.ts` | Parity |

## 4. Ranked improvement proposals (top 13)

1. **Playwright e2e + packaged release smoke** — `ax-code-desktop`. Why: biggest repeated gap vs all three refs. Sketch: `desktop/packages/e2e/` + `playwright.config.ts`, boot/update/chat/worktree suites; a `.github/workflows/release-desktop-smoke.yml` (name borrowed from OpenChamber) gating signed drafts. Contract: none. **S–M**, Testing+Release +1.5.
2. **Typed IPC (zod) + TS migration of electron hotspots** — `ax-code-desktop`. Generate zod schemas from `desktop-ipc-contract.json`; migrate `main.js` incrementally into `preload-ipc-policy.js`-style modules. **M–L**, Arch +1. Risk: churn vs release gates.
3. **Main-window `sandbox:true` + CSP without `unsafe-inline`** — desktop. Vite emits hashed assets under `app://`; replace inline scripts with nonces/hashes in `desktop-renderer-protocol.js:108`. **S–M**, Security +0.5.
4. **Perf-contract CI** — both. Desktop: budgets for transcript render/terminal echo (mirror Orca `performance-contracts.yml`). Runtime: promote `tui/performance-criteria.ts` manual gates to automated PTY-driven measurements. **M**, Perf +1.
5. **Agent dashboard (supervision view)** — both. Runtime first: SDK/ server endpoints for background-task + subagent status (TUI already consumes this internally — expose via OpenAPI → `packages/sdk/js` regen). Desktop: new `views/AgentDashboardView.tsx` modeled on OpenChamber `agent-manager/`. **M–L**, Supervision +1. Dependency: SDK release before desktop pin bump (`config/ax-code-sdk.json`).
6. **Notification host routing** — desktop. Port OpenChamber `electron/notification-host-routing.mjs` pattern into `electron/src/notifications-*` so tray/mini-chat/OS notifications route per-project/per-agent. **S–M**.
7. **Pop-out session windows** — desktop. Reuse `SettingsWindow.tsx` window plumbing for a per-session chat window (`electron/src` new `session-window.js`). **M**, UX +0.5.
8. **Exception inbox + desired-state surfacing** — desktop. Promised by repo `AGENTS.md` product charter, not yet implemented (no `ExceptionInbox`/registry components in `ui/src`). Build on `web/server/lib/scheduled-task-convergence/` + project registry. **M**.
9. **i18n expansion + RTL** — desktop. Add `ar`/`he` + RTL layout flag in `lib/i18n/context.tsx`. **S–M**.
10. **TUI plugin surface + storybook fixtures** — `ax-code`. Public command/panel registration API in `app-commands.ts`; fixture stories like OpenCode `feature-plugins/system/storybook`. **M**.
11. **TUI automated perf gates** — `ax-code`. See #4. **S** once harness exists.
12. **Arch-debt burn-down** — desktop. Split `ChatInput-impl.tsx` (4.9k) and `git/service.js` (5k) along existing seams (`ComposerActionButtons` already extracted; git service → `git/{worktree,pr,status}.js`). Continuing, **M** per quarter.
13. **Worktree lineage UX** — both. AX has worktrees but not Orca's lineage/jump-palette model (`orca/tests/e2e/worktree-lineage*.spec.ts`). Runtime already owns worktree execution; expose lineage metadata via SDK. **M**, differentiation.

## 5. Sequencing

- **Phase 1 (2 weeks):** #1 e2e skeleton + release smoke; #3 sandbox/CSP; #11/#4-runtime perf gates; start #2 zod IPC generation. All desktop-local — no SDK dependency.
- **Phase 2 (6 weeks):** runtime agent-status endpoints → SDK regen/release → desktop #5 dashboard; #6 notification routing; #7 pop-outs; #8 exception inbox; #9 i18n. Ordering: every runtime/SDK contract lands and is pinned before desktop consumption.
- **Phase 3:** mobile PWA shell, VS Code extension via runtime `packages/integration-vscode` (do not build in desktop), webhooks/connectors (runtime-first), Linux builds + updater cutover after signed receipts.

## 6. Do NOT copy

- **Orca's cloud relay estate** (25+ `cloud-*.yml` workflows) — operations-heavy infra outside our local-first boundary.
- **Orca's WSL/Windows-PTY depth** until Windows demand exists; it generated dozens of repro suites (`tests/tools/win-*`).
- **OpenCode's Effect-in-core** — ax-code `AGENTS.md` bans Effect absent an ADR; copy the *typed-IPC outcome* with zod, not the framework.
- **OpenCode's 35-theme catalog as a hard dependency** — ship discovery + a curated subset; theme maintenance is a treadmill.
- **Pixel-art sprawl** — Hermes has pets/starmap (`apps/desktop/src/main.tsx:81` pet-overlay; `app/routes.ts:23` STARMAP_ROUTE). Self-critique: AX TUI already carries ~100 `component/*-pixels.ts` scene files; freeze, don't grow.

---

# PART 2 — Hermes Agent and OpenChamber

## 1. Upstream drift (OpenChamber → AX Code Desktop)

| Surface | OpenChamber | AX Desktop | Verdict / port? |
|---|---|---|---|
| Multirun lanes + fusion | `ui/src/stores/useMultiRunStore.test.ts` | `views/MultiRunWindow.tsx`, `types/multirun.ts`, fusion prompts | **Present** — no drift |
| Mini-chat | `web/src/mini-chat-main.tsx` | same file exists | **Present** |
| PR view / source control | `web/src/api/source-control.ts` | `views/git/PullRequestSection.tsx` | **Present (different impl)** |
| Browser preview | `web/server/lib/browser-control/` | `web/server/lib/preview/` + `desktop-webmcp-browser.js` | **Present-but-different** (WebMCP direction) |
| Agent manager | `ui/src/components/views/agent-manager/AgentManagerView.tsx` | absent | **Missing — port** (desktop-owned; needs runtime status API) |
| Notification host routing | `electron/main.mjs:65` → `notification-host-routing.mjs` | server-side `web/server/lib/notifications/` only | **Missing — port** |
| SSH manager | `web/src/api/managed-ssh.ts` + tests | absent | **Missing — do not port as-is**; remote execution belongs to the runtime (boundary), consider runtime-side SSH targets + SDK surface later |
| Mobile pipeline | `packages/mobile/`, `mobile.html`, `sw.ts` PWA, `mobile-ci.yml`, `mobile-release.yml` | absent | **Missing — port Phase 3** as SDK-consuming PWA |
| VS Code extension | `packages/vscode/`, `vscode-extension.yml` | absent in desktop; runtime repo has `packages/integration-vscode` (ax-code `AGENTS.md`) | **Present-but-different** — keep in runtime repo; desktop must not duplicate |
| Release desktop smoke | `.github/workflows/release-desktop-smoke.yml` | smoke scripts exist (`electron/scripts/smoke-*.cjs`) but no packaged-release smoke workflow | **Partial — port** |
| Notarization-in-CI | release.yml pipeline | `electron-builder.yml:109` `notarize: true` locally configured; signed shadow receipts pending (ADR-012) | **Partial** — finish cutover |
| Spaces | Orca `tests/e2e/workspace-space-git-status.spec.ts` (Orca-side); OpenChamber worktree/spaces view per prior notes | worktrees yes (`lib/worktrees/`), spaces concept absent | **Partial** — fold into #13 lineage UX |

## 2. Hermes features we lack

- **Command center** (route + `zh-hant_command_center.ts` i18n): AX has a command palette but no cross-project command center page → build as desktop portfolio surface. **Port (light)**.
- **Pop-out session windows**: partial as above. **Port**.
- **Preview with console**: AX `web/server/lib/preview/` lacks a captured-console panel (WebMCP bridge exposes console reads to the *agent*, not a user-facing preview console). **Port into desktop preview**.
- **Theme skins/accents** (`apps/desktop/src/themes/{skin,accents,retint}.ts`): AX theming is token-based (`ui/src/types/theme.ts`) but single-skin. **Port accents only** (S).
- **Update channels + staged rollout UI** (`store/updates-channel.test.ts`, `update-feed.cjs`): fits ADR-012 completion. **Port concept**; MSIX/Store can wait.
- **Large-session resume e2e** (`e2e/large-session-resume.spec.ts`, `warm-resume-jitter.spec.ts`): directly feeds Part-1 proposal #1. **Port tests first**.
- **Cron**: Hermes `cron/`; AX runtime already has scheduled tasks (`tui/component/dialog-scheduled-task.tsx`, `web/server/lib/scheduled-task-convergence/`). **Parity — no action**.
- **Webhooks** (`e2e`-level `webhooks-rest.test.ts`, gateway): AX lacks; inbound webhooks belong to runtime + SDK, not desktop. **Runtime proposal**.
- **Gateway/messaging (Telegram/Discord/Slack, hosted rooms)** — `gateway/platforms/`, `hosted_room_*.py`: absent and **out of boundary** (AX Agent/Trust own durable runs and external comms). **Skip**.
- **ACP adapter** (`acp_adapter/`): absent. Editor-neutral agent protocol; evaluate as runtime surface after VS Code integration matures. **Defer**.
- **Profiles/fleet** (`store/profile*.ts`, fleet rail): absent; closest AX analog is provider/work-mode config. Multi-persona fleets conflict with AX Code's single-runtime-per-user model. **Skip for now**.

## 3. Proposals (top 10, these two sources only)

1. **Agent manager view** — desktop + runtime SDK (status endpoints). `views/agent-manager/` modeled on OpenChamber. **M**, Supervision +1.
2. **Notification host routing** — desktop. **S–M**.
3. **Release desktop smoke + update-channel UI** — desktop (OpenChamber workflow + Hermes channel model). **S–M**, Release +1.
4. **Mobile PWA companion** — desktop; read-only SDK consumption of sessions/notifications. `web/mobile.html` + `sw.ts` pattern. **M**, Breadth +0.5.
5. **Preview console panel** — desktop (`web/server/lib/preview/` + `webmcp` console messages). **S–M**.
6. **Command center page** — desktop; palette primitives exist. **M**.
7. **Large-session resume/jitter e2e suites** — desktop; port Hermes specs. **S** once Playwright lands.
8. **Theme accents** — desktop. **S**.
9. **Webhooks surface** — runtime first (`packages/ax-code/src/server`), then SDK; desktop only displays. **M–L**.
10. **Session pop-out windows** — desktop (dup from Part 1 #7; strongest cross-source UX item). **M**.

## 4. Do NOT copy (Part 2)

- **Hermes pets/particles/starmap** (`store/pet-overlay.ts`, `store/starmap.ts`) — feature sprawl, zero supervision value.
- **Hermes gateway/messaging** — wrong owner (AX Agent/AX Trust), huge security surface.
- **Hermes's 60+ flat `hermes_state_*.py` root modules** — the arch-5 anti-pattern; AX must not let `web/server/lib` drift that way (`git/service.js` at 5k lines is the warning sign).
- **Hermes's per-surface × per-locale i18n file explosion** (`i18n/{locale}_{surface}.ts`, 100+ files) — keep AX's one-file-per-locale JSON model.
- **OpenChamber tunnels** (`web/server/lib/{dev-tunnel,ngrok-tunnel,cloudflare-tunnel}.js`) — inbound-tunnel exposure belongs behind AX Trust policy, not a desktop lib.
- **MSIX/Store distribution** — until ADR-012 signed receipts land, adding a second Windows channel multiplies release liability.

**Summary:** AX Code Desktop's product breadth is better than its 76.5 score suggests (worktrees, multirun+fusion, PR view, mini-chat, passkeys, 13 locales all verified present), and the AX TUI is competitive with OpenCode's. The decisive deficits are process, not features: zero e2e/visual regression, no perf-contract CI, unfinished release/updater cutover, untyped IPC, and missing supervision surfaces (agent dashboard, notification routing, exception inbox — the last being a chartered-but-unbuilt desktop responsibility). Fix those first; every new data surface starts in `ax-code` runtime + SDK, then desktop consumes via the pinned SDK.