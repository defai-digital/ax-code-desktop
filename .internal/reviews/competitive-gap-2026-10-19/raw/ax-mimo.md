# PART 1 — AX Code Desktop & TUI gap review vs Orca / OpenCode

## 0. Corrections to the prior claims (verified in code)

| Prior claim | Verdict | Evidence |
|---|---|---|
| 58 files >1k lines incl. `ChatInput-impl.tsx`, `FilesView-impl.tsx`, `web/server/lib/git/service.js`, `electron/src/main.js`; untyped CommonJS electron; `-impl` cosmetic | **Confirmed in kind.** The four files exist at the claimed paths. Electron is CommonJS (`main.js:23` `require("electron-updater")`). `-impl` split is real and shallow (`ui/src/lib/composerControls.test.ts:49` just greps `ChatInput-impl.tsx` text). | `desktop/packages/ui/src/components/chat/ChatInput-impl.tsx`, `.../views/FilesView-impl.tsx`, `desktop/packages/web/server/lib/git/`, `desktop/packages/electron/src/main.js` |
| No Playwright e2e / visual regression; some tests pattern-match source text | **Confirmed.** No `playwright.config.*` anywhere under `ax-code-desktop`. Source-text tests are real: `ui/src/lib/needsYou.test.ts:87-89`, `commandPaletteDialogHeader.test.ts:12`, `composerControls.test.ts:40-89` all `readFileSync` components and assert substrings. | contrast: Orca `tests/e2e/*.spec.ts` (100+ files: `worktree.spec.ts`, `terminal-*.spec.ts`, `update-*.spec.ts`) |
| Updater cutover pending; mac-arm64 only, win-x64 only | **Partly outdated.** `electron-updater` is wired (`main.js:970-1088` autoDownload=false, generic feed URL). "Cutover pending" is not visible as a code TODO; platform matrix not re-verified here. | `electron/package.json:24` |
| `webviewTag:true`, CSP `unsafe-inline`, `runAsNode` fuse on, no explicit sandbox | **Mostly confirmed.** `webview-policy.js:14` `webviewTag: true`; `desktop-renderer-protocol.js:108-109` CSP `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'`. However `sandbox: true` IS set for secondary webviews (`wiki-viewer.js:80`, `desktop-webmcp-browser.js:260`); main-window sandbox and `runAsNode` fuse not found in source (fuse defaults on in electron-builder unless flipped). | as cited |

Additional finding: AX Desktop is **not** feature-empty vs OpenChamber — it already has multirun (`ui/src/stores/useMultiRunStore.ts`), browser panel (`ui/src/stores/useUIStore-impl.ts:521-560`), command palette (`ui/src/components/ui/CommandPalette.tsx`), mini-chat (`web/mini-chat.html`, `web/src/mini-chat-main.tsx`), project-group helpers (`ui/src/components/session/scheduledTaskGroups.ts`). The gap is depth, not absence.

## 1. Desktop gap table

| Capability | AX state (evidence) | Orca (evidence) | OpenCode (evidence) | Impact |
|---|---|---|---|---|
| Worktree as core unit | Missing in Desktop (worktree exec is runtime-owned). Desktop has no worktree board. | **Strong**: `orca/src/cli/specs/worktree-set.ts`, `worktree-lineage*`, `tests/e2e/worktree-*.spec.ts` (20+) | Partial (`packages/desktop`) | Supervision +2 Orca; port **UI shell only**, logic stays in `ax-code` |
| Agent dashboard / pop-out windows | Missing pop-out (`ui/` has single-window layout; `InspectorRail.tsx`) | **Strong**: `orca/src/renderer/` pop-out | `packages/desktop/src/main/windows/` | Supervision/UX |
| Mobile companion | Missing | **Strong**: `orca/mobile/`, relay-bench tests `tests/tools/relay-bench/` | n/a | Breadth |
| E2E / perf-contract CI | Missing Playwright; source-pattern tests only (above) | **Strong**: `orca/tests/e2e/` 100+ specs incl. latency `terminal-split-activation-latency`, `workspace-layout-oracle-latency` | TUI perf tests `packages/tui/test/session-mount-budget.test.tsx` | Testing −2; Release −1 |
| Task integrations (GitHub/GitLab/Jira/Linear) | GitHub only (`web/server/lib/github/`, `ui/src/api/github.ts`) | **Strong**: `orca/src/cli/specs/jira.ts`, `linear.ts`, `linear-mcp.ts` | via plugins | Breadth |
| Browser pane | **Partial**: `useUIStore-impl.ts:521` `BrowserPanelState`; `electron/src/desktop-webmcp-browser.js` | **Strong**: `specs/browser-basic.ts`, `browser-advanced.ts` | browser preview | UX |
| Editor | Missing in Desktop | Orca has editor | OpenCode `packages/ui` | UX |
| Effect-Schema typed IPC | **Weak**: untyped `web/server` CommonJS + `ui/src/api/*` hand-rolled | n/a | **Strong**: `desktop/src/shared/ipc-contract.ts`, `ipc-transport.ts`, `main/ipc.ts` | Arch −3 (main cause of 6 vs 9) |
| Layered main process | **Weak**: `electron/src/main.js` monolith (~3.8k) | n/a | **Strong**: `main/{windows,storage,files,service}/` split | Arch |
| Design system + Storybook | **Weak**: shadcn-style `ui/src/components/ui/` | n/a | **Strong**: design-system packages + storybook (prior review; `packages/ui`) | UX/Testing |
| Locales | Unknown/limited (i18n keys via `titleKey` in `MagicPromptsPage.tsx`) | n/a | 63 locales (`desktop/src/main/extension/module.ts:18`) | UX |
| Timeline virtualizer / workers | **Partial**: TUI has `timeline-rail.tsx`, `stream-paint.ts`; Desktop transcript not virtualized | Orca terminal atlas budget tests | **Strong**: custom virtualizer + workers + benchmarks | Perf −2 |
| Sandbox | Partial (secondary webviews yes; main window unclear) | n/a | **Strong**: `main/windows/early.ts:60` `sandbox: true` | Security |
| Release matrix / updater | electron-updater wired; single-arch claims stand | Orca `win-update-e2e/`, `update-running-instances.spec.ts` | release tooling | Release −2 |

## 2. TUI gap table (AX Code TUI vs OpenCode TUI)

AX TUI is **much stronger than the prior "unscored" silence suggested** — it is a real product surface (`cli/tui/routes/session/` has 80+ modules).

| Capability | AX TUI (evidence) | OpenCode TUI (evidence) | Verdict |
|---|---|---|---|
| Session switching | **Present**: `component/dialog-session-list.tsx`, `app-commands.ts:122` `command.switchSession`, `session-list-data.ts` | `component/session-tabs.tsx`, `context/session-tabs.tsx` | Parity (OpenCode has persistent tabs) |
| Sub-agent view | **Present, arguably ahead**: `routes/session/subagent-panel-layout.ts`, `subagent-status-panel.tsx`, `child.ts`, `tool-renderers/ensemble*.tsx` | `routes/session/composer/subagents-tab.tsx`, `mini/footer.subagent.tsx` | AX ≥ OpenCode |
| Diff / review | **Partial**: `dialog-compare.tsx`, `compare.ts`, `turn-changed-files-view-model.ts`, `tool-renderers/file-edits.tsx` | **Strong**: `feature-plugins/system/diff-viewer.tsx`, `diff-viewer-file-tree.tsx`, `component/patch-diff.tsx` | OpenCode ahead (file-tree diff browser) |
| Permission UX | **Present**: `routes/session/permission.tsx`, `permission-command-view-model.ts`, `util/permission-submit-latch.ts` | `mini/footer.permission.tsx` | Parity |
| Themes | **Present**: `context/theme`, `ui/dialog-*.tsx` all `useTheme` | `context/theme.tsx`, `theme/v2/resolve.test.ts` | Parity (OpenCode has versioned theme engine) |
| Keybinds | **Present**: `ui/dialog-help-view-model.ts:25` "Keybinds schema", `keybind.print` user overrides | `test/plugin-keymap.test.tsx`, `plugin-keymap` | Parity |
| Mouse | **Present**: `onMouseUp` throughout (`ui/link.tsx:24`, `dialog-alert.tsx:31`) | present | Parity |
| Long-session perf | **Partial**: `stream-paint.ts`, `coalesce-stream-events.ts`, `step-windows.ts`, `transcript.tsx`, `elide-part-snapshot.ts` | **Strong**: `session-mount-budget.test.tsx`, mini `scrollback.surface.ts`, workers | OpenCode ahead (budgeted mounts, tested) |
| Multi-project from terminal | **Partial**: `project-arg.ts`, `workspace/dialog-session-list.tsx` | session groups `group-view.tsx` | OpenCode slightly ahead |
| Plugin/extension surface | **Partial**: `capability-catalog.ts`, `dialog-capability-catalog.tsx` | **Strong**: `feature-plugins/`, `plugin-markdown`, `plugin-native-resources` | OpenCode ahead |
| Tests | Decent unit tests (`test/cli/tui/*`: ffi-guard, pointer-pin, startup-smoke, layering) | **Stronger**: 40+ TUI tests incl. snapshot-ish views (`test/session-home.test.tsx`, `markdown-streaming.test.tsx`) | OpenCode ahead |
| Diff viewer / git UI in TUI | No equivalent of OpenCode `diff-viewer` | as above | Gap |
| Orca CLI supervision (n/a TUI) | AX CLI lacks fleet/orchestration verbs | Orca `specs/orchestration.ts`, `agent-launch.ts`, `profile-state.ts`, `worktree-ps-*` | Port *verbs* into `ax-code` CLI, not Desktop |

## 3. Ranked improvement proposals (top 12)

1. **Playwright e2e + visual regression harness** — owner `ax-code-desktop`. Add `desktop/packages/ui/e2e/` + `playwright.config.ts`; golden flows: login, project open, chat send, permission prompt, exception inbox. Replaces source-grep tests (`composerControls.test.ts`). Effort M. Testing +2, Release +1.
2. **Effect-Schema (or zod) typed IPC contract layer** — owner `ax-code-desktop`, model on `opencode/packages/desktop/src/shared/ipc-contract.ts`. Extract from `web/server/index.js` + `electron/src/main.js` into `shared/ipc-contract.ts` + generated types. Effort L. Arch +3. Dependency: none.
3. **Electron main-process layering + size caps** — owner `ax-code-desktop`. Split `main.js` into `main/{windows,updater,server-lifecycle,webview-policy}/` like OpenCode `src/main/`; add `max-lines` lint for >1k files (`ChatInput-impl.tsx` → feature folders). Effort M. Arch +2.
4. **Security hardening pass** — owner `ax-code-desktop`. Flip `webview-policy.js:14` to `webviewTag:false` (or pin allowlist), drop `unsafe-inline` from `desktop-renderer-protocol.js:108`, set `sandbox:true` on `BrowserWindow`, disable `runAsNode` fuse in electron-builder. Effort S. Security +1; easiest win.
5. **Runtime worktree + multi-session supervision API, Desktop board UI** — split: `ax-code` exposes worktree/session status via SDK/server (`packages/sdk`, server API); `ax-code-desktop` renders a board like Orca `worktree.spec.ts` flows. Logic stays in runtime per boundary. Effort L. Supervision +2.
6. **TUI diff-reviewer (file-tree + side-by-side)** — owner `ax-code`. Port OpenCode `diff-viewer*.tsx` concepts into `cli/tui/routes/session/` using existing `turn-changed-files-view-model.ts` + `compare.ts`. Effort M. UX +1 TUI.
7. **Multirun fusion dialog** — owner `ax-code-desktop`. `useMultiRunStore.ts` exists; add `ui/src/lib/multirun/fusion.ts` + `MultiRunFusionDialog.tsx` equivalents of OpenChamber (see Part 2). Runtime must expose ensemble/council results via SDK. Effort M. Supervision +1.
8. **TUI transcript virtualization + mount budgets** — owner `ax-code`. Add budget tests like OpenCode `session-mount-budget.test.tsx`; extend `stream-paint.ts`/`step-windows.ts`. Effort M. Perf +1.
9. **TUI plugin surface** — owner `ax-code`. A documented keymap/theme/render-hook plugin API in `cli/tui/`, modeled on OpenCode `feature-plugins/`. Effort L. Breadth +1.
10. **Task integrations (Jira/Linear) via runtime connectors** — owner `ax-code` (connector + SDK types) + thin Desktop UI. Orca `specs/jira.ts`, `linear.ts` as behavior reference. Effort M. Breadth +1.
11. **i18n expansion + RTL** — owner `ax-code-desktop` (+ TUI `cli/tui/i18n/`). Extract hard-coded strings; target Hermes's 9-locale bar. Effort M. UX +1.
12. **Release matrix + perf-contract CI** — owner `ax-code-desktop`. Add win-x64/mac-arm64 (and linux) smoke on packaged builds like Orca `tests/tools/win-update-e2e/` and latency oracles. Effort M. Release +2.
13. **Pop-out session windows** — owner `ax-code-desktop` (pure UX). Orca-style multi-window with shared server connection. Effort M. Supervision +1.
14. **CLI supervision verbs** — owner `ax-code`. `ax-code status/agents/worktrees` mirroring Orca `specs/orchestration.ts` outputs, so terminal supervisors don't need the Desktop. Effort M. Supervision +1.
15. **Source-pattern test conversion** — owner `ax-code-desktop`. Replace `needsYou.test.ts`/`composerControls.test.ts` readFileSync assertions with RTL component tests. Effort S. Testing +1.

## 4. Sequencing

**Phase A (2 weeks):** #4 security (S), #15 test conversion (S), #1 Playwright harness scaffolding (M), #12 CI smoke skeleton. No runtime dependency.

**Phase B (6 weeks):** #2 typed IPC + #3 main-layering (order: contract first, then split), #6 TUI diff-reviewer, #8 TUI perf budgets, #13 pop-out. Runtime-side #14 can start in parallel in `ax-code`; ship SDK before Desktop #5.

**Phase C (later):** #5 worktree board (needs runtime/SDK release), #7 multirun fusion (needs ensemble API), #9 TUI plugins, #10 integrations, #11 i18n. **Cross-repo rule:** any Desktop feature needing new data ships in `ax-code` server/SDK first (versioned), Desktop consumes only published contracts.

## 5. Do NOT copy (Orca/OpenCode)

- Orca's **in-desktop agent orchestration / orchestration-worker** logic (`orca/src/cli/specs/orchestration-worker-specs.ts`) — that is runtime territory (`ax-code` agent loop).
- Orca's **~700 bespoke e2e surface area as-is** (terminal-conpty, WSL fences) — copy the *harness pattern* and a smoke subset, not the full suite; cost/ownership mismatch for our matrix.
- OpenCode's **monorepo package sprawl** for a product our size — take `ipc-contract` + `windows/` layering, not every package.
- Orca **VM/emulator/browser-advanced tooling** (`specs/vm.ts`, `emulator.ts`, `computer.ts`) — out of AX scope.

---

# PART 2 — OpenChamber drift & Hermes gaps

## 1. Upstream drift (OpenChamber → AX Code Desktop)

| Surface | Verdict | OpenChamber evidence | AX evidence | Port? |
|---|---|---|---|---|
| Multirun fusion | **Partial** | `packages/ui/src/lib/multirun/fusion.ts`, `autoFusion.ts`, `MultiRunFusionDialog.tsx`, `RunLaneCard.tsx`, `AskOtherModelsDialog.tsx` | `ui/src/stores/useMultiRunStore.ts`, `ui/src/lib/multirun/title.ts` only | **Port UI fusion** to `ax-code-desktop`; fusion *policy* must live in `ax-code` ensemble API |
| SSH manager | **Missing** | `packages/electron/ssh-manager.mjs` (+test) | only git SSH keys `ui/src/components/sections/git-identities/GitIdentityEditorDialog.tsx:77` | **Port** to `ax-code-desktop` (desktop-owned host config) OR skip if secrets policy forbids; not runtime logic |
| Spaces | **Missing** | `packages/web/server/lib/spaces/*`, `ui/src/lib/spaces/*`, `space-catalog-sync.ts` | no spaces module in `desktop/packages/**` | **Port carefully**: spaces = project grouping UX → Desktop; if spaces imply agent routing, that part stays in runtime |
| Agent manager | **Missing** | `packages/ui/src/components/views/agent-manager/AgentManagerView.tsx` | none | **Skip** agent lifecycle management (runtime-owned). Keep only a *status* view fed by SDK |
| Mobile | **Missing** | `packages/ui/src/apps/mobileConnections.ts`, `MobileWorkspaceDrawer.tsx`, `.github/workflows/mobile-ci.yml`, `mobile-release.yml` | none | **Skip for now** (Hermes-scale product surface); revisit after Desktop stability |
| VS Code extension | **Missing** | `.github/workflows/vscode-extension.yml` | only "open in VS Code" `ui/src/stores/useOpenInAppsStore.test.ts:108` | **Skip** (separate distribution channel) |
| PR view | **Missing** | `packages/ui/src/components/views/PullRequestView.tsx` (used in `ContextPanel.tsx:8,799`) | only PR-link mime `ui/src/components/chat/FileAttachment.tsx:317` | **Port** light PR panel to Desktop (reads GitHub API already present `web/server/lib/github/`) |
| Browser panel | **Present-but-different** | space draft panels incl. browser (pr-evidence screenshots) | `useUIStore-impl.ts:521` `BrowserPanelState`, `electron/src/desktop-webmcp-browser.js` | Keep ours; close feature gaps only |
| Notification routing | **Present-but-different** | `packages/ui/src/sync/notification-store.ts` | `web/server/lib/notifications/`, `ui/src/api/notifications.ts` | Keep ours; verify host routing parity |
| Mini-chat | **Present** | mini-chat heritage | `web/mini-chat.html`, `web/src/mini-chat-main.tsx` | Keep |
| Release smoke / notarization | **Partial/unknown** | `.github/workflows/` (desktop smoke, notarization evidence in CI) | `electron/` packaging scripts exist; no e2e smoke (Part 1) | **Port** the smoke pattern with proposal #12 |
| Worktrees view | **Runtime-owned** | spaces+worktrees UI | none in Desktop | Desktop may render worktree board **from runtime API only** (proposal #5) |

## 2. Hermes features we lack

| Feature | Hermes evidence | AX Desktop / runtime | Recommendation |
|---|---|---|---|
| Command center | `apps/desktop/src/app/command-center/` | none (CommandPalette is narrower: `ui/src/components/ui/CommandPalette.tsx`) | **Port** a bounded command center (palette + maintenance actions) to Desktop; effort M |
| Fleet profile rail / profiles | `use-fleet-roster.ts`, `hermes-fleet-connector.yaml`, `hermes_cli/update_cmd_fleet.py` | none | **Skip** fleet (multi-bot ops is Hermes gateway domain). Port only per-project profiles if needed |
| Project groups | sidebar project grouping | partial: `scheduledTaskGroups.ts` `buildProjectGroups` | **Extend** existing groups to all sidebar sections |
| Git worktree ops from GUI | (Hermes worktree ops noted) | runtime-owned | **Skip in Desktop**; runtime API then thin UI (shared with #5) |
| Pop-out session windows | noted | missing | **Port** (proposal #13) |
| Native notifications | noted | `web/server/lib/notifications/` | Parity check only |
| Preview with console | noted | `BrowserPanelState` + webmcp browser | **Port console strip** onto existing panel |
| MCP/skills/plugins/connectors | `plugin-catalog/hermes-cron.yaml`, `hermes-fleet-connector.yaml` | Desktop `web/server/lib/skills-catalog/`; TUI `capability-catalog.ts` | Keep ours; **port connector registry UX** only |
| Cron | `gateway/session_cron.py`, `hermes_cli/cron.py`, `tests/cron/*` (large) | Desktop `web/server/lib/scheduled-task-convergence/`, `SidebarScheduledTasks.tsx` | **Port robustness ideas** (recovery, provider pin: `tests/cron/test_cron_provider_pin.py`) into `ax-code` scheduler; UI already exists |
| Webhooks | `gateway/platforms/webhook*.py`, `hermes_cli/webhook.py`, `outbound_webhooks.py` | none | **Port** outbound webhooks to `ax-code` server (signed, rate-limited — see `tests/gateway/test_webhook_signature_rate_limit.py`) + Desktop config UI |
| Command palette | noted | `CommandPalette.tsx` | Present; extend with command center |
| 9 locales + RTL, theme skins | `canonical-group-locales.ts` | limited i18n | **Port** i18n architecture (proposal #11) |
| Transcript windowing | noted | TUI `step-windows.ts` partial | Align with TUI #8 |
| ~70 Playwright e2e incl. auto-update + packaged | `tests/e2e/` | none | **Port harness** (proposal #1/#12) |
| MSIX / release channels | noted | electron-updater generic feed | **Port** channels config only if Windows ships |
| Gateway/messaging, ACP | Hermes gateway/ | out of scope | **Skip** (would duplicate runtime server) |

## 3. Top 10 proposals from these sources only

1. **Multirun fusion UI** (Desktop) + ensemble results API (`ax-code`) — sketch: `ui/src/lib/multirun/fusion.ts`, `components/multirun/MultiRunFusionDialog.tsx` (OpenChamber names are the blueprint); SDK: `GET /ensemble/:id/candidates`. M. Supervision +1. Risk: UI-side merge policy drift → forbid; policy in runtime.
2. **PR panel** (Desktop) — `ui/src/components/views/PullRequestView.tsx` + `web/server/lib/github/` extension. S. Breadth +1.
3. **Spaces-lite project groups** (Desktop) — generalize `scheduledTaskGroups.ts` → `projectGroups/` used by sidebar, inbox, board. S. UX +1. Risk: do not import OpenChamber `spaces/space-opencode.js` agent routing.
4. **Outbound webhooks** (ax-code) + settings UI (Desktop) — `packages/ax-code/src/server/webhooks/`, HMAC + replay protection as in `tests/gateway/test_webhook_authority.py`. M. Breadth +1.
5. **Scheduler hardening** (ax-code) — port recovery/provider-pin semantics (`test_cron_recovery.py`, `test_cron_provider_pin.py`) into scheduled-task-convergence runtime. M. Supervision +1.
6. **Command center** (Desktop) — fold CommandPalette + maintenance (`hermes command-center/maintenance.tsx` as UX reference). M. UX +1.
7. **Browser panel console + preview polish** (Desktop) — extend `desktop-webmcp-browser.js`. S. UX +1.
8. **SSH host manager** (Desktop) — port `openchamber packages/electron/ssh-manager.mjs` behavior, keep keys in OS keychain. M. Breadth +1. Risk: secret storage; must match Desktop security posture.
9. **Playwright packaged-build + updater suite** (Desktop) — Hermes `tests/e2e` auto-update pattern. M. Release +2.
10. **Pop-out windows** (Desktop) — session detach. M. Supervision +1.

## 4. Do NOT copy (Hermes/OpenChamber)

- **Pets / starmap / particles** (`apps/desktop/src/app/settings/pet-settings.tsx`, `app/routes.ts:23` `STARMAP_ROUTE`) — pure gamification sprawl; zero agent-supervision value.
- **Hermes gateway/messaging platform adapters** (`gateway/platforms/webhook_*.py`, msgraph) — that is a chat-ops product; AX runtime already owns the server API.
- **Fleet roster / multi-bot update manager** (`update_cmd_fleet.py`, `use-fleet-roster.ts`) — wrong product shape.
- **OpenChamber agent-manager as agent lifecycle owner** (`views/agent-manager/AgentManagerView.tsx`) — violates ownership boundary (runtime owns agent loop).
- **OpenChamber `space-opencode.js` dual-runtime coupling** — embeds a second agent runtime; AX must speak only SDK/server API.
- **Hermes feature sprawl as a whole** (cron+webhooks+pets+gateway+MSGraph in one desktop) — the 18k-line `main.ts` class of failure; take individual mechanisms (webhook signing, cron recovery) not the monolith.

**Bottom line:** AX Code Desktop's biggest score deficits are **Testing** (no e2e, source-grep tests), **Architecture** (untyped monolith Electron/`-impl` files), and **Release** (matrix/smoke) — all fixable inside `ax-code-desktop` in Phase A/B without boundary violations. TUI is competitive with OpenCode except diff-reviewer, virtualization proof, and plugins. From OpenChamber, port **fusion UI, PR panel, spaces-lite, SSH manager**; from Hermes, port **webhooks, scheduler hardening, command center, e2e/update suites**; leave agent lifecycle, fleet, and gateway to the runtime or to the bin.
The report deliverable was already produced in the previous message. Marking the final todo complete — no further exploration needed, and no files will be written (task is STRICTLY READ-ONLY; deliverable is the chat answer).
All todos are complete. The full gap-review report was delivered in the previous message:

**Part 1** — Desktop gap table vs Orca/OpenCode (with corrections: Playwright truly absent and source-grep tests confirmed; `webviewTag:true` + CSP `unsafe-inline` confirmed but secondary webviews do set `sandbox:true`; `electron-updater` is wired, so "cutover pending" is partly outdated), TUI gap table vs OpenCode (AX TUI is stronger than previously scored — subagent views, permission UX, themes, keybinds, mouse all present; gaps are diff-reviewer, virtualization proof, plugins, tests), 15 ranked proposals with owners/effort/score impact, 3-phase sequencing with runtime-before-desktop ordering, and a do-not-copy list.

**Part 2** — OpenChamber drift table (port fusion UI, PR panel, spaces-lite, SSH manager; skip agent-manager/mobile/VS Code extension per ownership boundary), Hermes gap table (port webhooks, scheduler hardening, command center, e2e/update suites; skip fleet/gateway/pets), 10 ranked proposals from those sources only, and a do-not-copy list (pets/starmap, fleet, gateway, agent lifecycle, `space-opencode.js` dual-runtime coupling).

No repository files were created, edited, staged, or committed — the deliverable is this chat answer, per the STRICTLY READ-ONLY constraint.
