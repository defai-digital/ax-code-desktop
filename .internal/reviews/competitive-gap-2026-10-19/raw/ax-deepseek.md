# Gap review: AX Code vs Orca, OpenCode, Hermes Agent, OpenChamber

Method: read-only inspection of the named trees. Shell was denied, so exact repo-wide line counts/test counts could not be re-run; claims I could not independently count are marked **unverified**. Every structural claim below cites a file I read or a glob/grep I ran.

## Part 1 — Desktop and TUI

### Corrections to the prior review

| Prior claim | Verdict | Evidence |
|---|---|---|
| 58 files >1,000 lines; four named files | **Partly confirmed** | `ChatInput-impl.tsx` ≥4,869 lines (read at offset 4,860); `electron/src/main.js` ≥3,769 (offset 3,760). The 58-file total and the other two sizes were not recounted (**unverified**). |
| No Playwright e2e or visual regression | **Confirmed** | Repo-wide `**/*playwright*` returns only `ui/src/assets/icons/file-types/playwright.svg`; no config/spec exists. |
| Some tests pattern-match source text | **Confirmed** | `ui/src/components/dashboard/DashboardPanel.source.test.ts:13`, `ui/src/components/views/GitHubBoardView.mount.test.ts:7` read source and assert strings. |
| `webviewTag: true`, CSP `unsafe-inline`, `runAsNode` on, no explicit sandbox | **Confirmed, with nuance** | `electron/src/webview-policy.js:9-16` (no `sandbox`); `desktop-renderer-protocol.js:108`; `electron-builder.yml:22`. Webviews and auxiliary windows *do* set `sandbox: true` (`webview-policy.js:51`, `wiki-viewer.js:80`); only the privileged `app://` renderer lacks it. |
| Untyped CommonJS Electron layer | **Partial** | Implementation is `.js` CommonJS, but a typed boundary exists: `electron/src/desktop-ipc-contract.json`, `preload-ipc-policy.js`. Whether every channel is validated against it is unverified. |
| macOS arm64 only, Windows x64 only | **Partly wrong** | `electron-builder.yml:85-123` = macOS arm64 only, Windows x64 only, but Linux AppImage/deb on amd64+arm64 (`:151-159`). |
| No design-system/Storybook | **Confirmed** | `**/*.stories.tsx` under `ui` returns none. Locales are 14, not 63 (`ui/src/lib/i18n/messages/{de,en,es,fr,id,it,ja,ko,pt-BR,ru,tr,vi,zh-CN,zh-TW}`). |
| Editor missing | **Wrong** | AX has `ui/src/components/ui/CodeMirrorEditor.tsx` and a full files view. |

Desktop-owned routes are narrow and mostly legitimate: `web/server/lib/desktop-owned-routes.js` lists only filesystem mutations/read policy, not a second agent loop. The runtime boundary is being respected.

### Desktop gap table

| Capability | AX state | Reference evidence | Impact |
|---|---|---|---|
| Worktree as core unit | Partial: session-scoped worktrees (`lib/worktreeSessionCreator`, `CommandPalette.tsx:265`), settings `WorktreeSectionContent.tsx`; no lineage/board | Orca `tests/e2e/worktree-lineage*.spec.ts`, `worktree-lifecycle.spec.ts`; Hermes `app/chat/sidebar/projects/worktree-dialog.tsx` | Supervision: users can't compare/clean many worktrees. |
| Dashboard pop-out | Weak: iframe + `window.open(..., "_blank")` (`dashboard/DashboardPanel.tsx:136-150`) | Orca `renderer/src/popout.tsx:11`, `DashboardPopoutRoot`; Hermes `store/windows`, `session-actions-menu.tsx:313` | Multi-monitor supervision; browser tab loses state. |
| Mobile companion | Missing: only responsive `MobileOverlayPanel.tsx` | Orca `mobile/src/{worktree,terminal,tasks,session}`; OpenChamber `packages/mobile`, `web/src/mobile-main.tsx` | No away-from-desk supervision. |
| E2E / visual regression | Missing (above) | Orca `tests/e2e` 100+ (truncated; ~700 unverified); Hermes `apps/desktop/e2e` 30+; OpenChamber `release-desktop-smoke.yml` | Release score 7; regressions ship. |
| Typed IPC | Partial: JSON contract + preload policy | OpenCode `desktop/src/shared/ipc-contract.ts`, `main/ipc-transport.test.ts:5` (Effect Schema), `windows/early.ts:60` (`sandbox: true`) | Architecture/security. |
| Renderer sandbox | Missing for main window | OpenCode `windows/appearance.ts:45` | A renderer RCE is host RCE. |
| Integrations | GitHub only (`web/server/lib/github`, `GitHubBoardView.tsx:107`) | Orca `src/main/{github,gitlab,jira,linear?}`; OpenChamber `server/lib/{gitlab,linear}`, `api/linear.ts` | Team workflows; GitLab/Linear users excluded. |
| Locales/RTL | 14, no RTL locale | Hermes `i18n/ar*.ts` (RTL); OpenCode far larger set (63 per prior review, not recounted) | MENA/global adoption. |
| Release pipeline | No release workflow; only `desktop-ci.yml`, `desktop-shadow.yml`, `codeql.yml` | OpenChamber `release.yml` + `release-desktop-smoke.yml`; Hermes MSIX (`electron-builder.config.cjs:236`) | Release score 7; updater cutover blocked. |
| Perf contract CI | No perf job found | Orca `terminal-typing-latency.spec.ts`, `workspace-layout-oracle-latency.spec.ts` | Perf score 7. |
| Browser pane / editor | Present (`layout/ContextPanel-impl.tsx:1762`; `CodeMirrorEditor.tsx`) | Orca/Hermes equivalents | Not a gap. |

### TUI gap table (AX `packages/ax-code/src/cli/tui` vs OpenCode `packages/tui`)

| Capability | AX | OpenCode | Verdict |
|---|---|---|---|
| Session tabs / unread | None: grep `session.tab|SessionTabs` = 0; one route + sidebar (`routes/session/sidebar.tsx`) | `app.tsx:59-133` `SessionTabsProvider`, `component/session-tabs`, 10 select keybinds, unread next/prev | **Missing — biggest gap** |
| Multi-project | `project-arg.ts` only; one cwd per process | `context/location`, `routes/grouping/tree.ts`, `group-view.tsx`, `home.tsx` | Missing/partial |
| Sub-agent view | Status panel only: `routes/session/subagent-status-panel.tsx`, `child.ts` | `routes/session/composer/subagents-tab.tsx` (inline, inspectable) | Partial |
| Terminal pane | None (only `useTerminalDimensions`) | `composer/terminals-tab.tsx`, `shell-tab.tsx` | Missing |
| Diff/review | Present: `component/dialog-diff-viewer`, `turn-changed-files-row.tsx:6`, `diff_wrap_mode` | `test/cli/tui/diff-viewer.test.tsx`, `util/diff.ts` | Parity |
| Permission UX | Present: `routes/session/permission.tsx`, `permission-command-view-model.ts`, safety tests `test/cli/tui/permission-safe-default.test.ts` | `routes/session/permission.tsx`, `util/permission.ts` | Parity; AX has explicit safe-default coverage |
| Themes | **34** JSON (`context/theme/*.json`) | **33** JSON (`theme/assets/*.json`) | AX slightly ahead |
| Keybinds | `context/keybind.tsx`; user overrides documented `dialog-help-view-model.ts:63` | config keymap + plugin keymap (`test/plugin-keymap.test.tsx`) | Parity |
| Mouse | SGR mouse paths + perf gates (`performance-criteria.ts:47-61`) | selection/scroll tests | Parity |
| Long-session perf | Explicit contract: 2,000-message projection p95 25 ms, scroll ≥45 fps (`performance-criteria.ts:63-77`), retention tests (`test/cli/tui/sync-transcript-retention.test.ts`) | `routes/session/mount-budget.ts`, scroll tests | AX equal/better documented |
| Plugin surface | Contract only: `renderer-contract.ts:77` plugin slots, `performance-criteria.ts:95`; no loader | `plugin/`, `feature-plugins/`, plugin discovery/keymap/source tests | Missing/partial |
| Tests | Roughly 3 dozen CLI/TUI tests (glob `test/cli/tui/*` + TUI-named) | 100+ TUI tests (glob truncated at 100) | Gap |

### Part 1 proposals (ranked)

| # | Proposal | Owner | Sketch | Contract | Effort | Score | Risk |
|---|---|---|---|---|---|---|---|
| 1 | Session tabs + unread + close/reopen in TUI | `ax-code` | Add `context/session-tabs.tsx`, `component/session-tabs.tsx`; keybinds in `app-commands.ts`; unread derivation in `util/session-activity.ts` | None (client-local persistence via existing KV) | M | TUI supervision +2 | Tab/route state drift; must not fork event store |
| 2 | Sandbox the main renderer; remove `unsafe-inline` | `ax-code-desktop` | Set `sandbox: true` in `webview-policy.js:9`; move inline bootstrap to hashed/external script; keep `wasm-unsafe-eval` | None | S | Security +1 | Preload currently assumes unsandboxed Node; test `preload.js` |
| 3 | Playwright + visual regression harness | `ax-code-desktop` | Add `desktop/playwright.config.ts`, `e2e/{boot,session,worktree,permission,update}.spec.ts`; screenshot baselines per theme | None | L | Testing +2, release +1 | Flaky Electron first-paint; use deterministic fixtures |
| 4 | Native worktree board (list/diff/cleanup/lineage) | `ax-code-desktop` (runtime data already exists) | New `components/worktrees/`; replace `WorktreeSectionContent` links; reuse `api/git.ts` | Runtime: expose worktree list/status in one endpoint if not already | M | Supervision +2 | Duplicating git logic — must call runtime |
| 5 | Native dashboard pop-out window | `ax-code-desktop` | Replace iframe/`window.open` with `BrowserWindow` + `dashboard.html` (mirror `main.js:2360`) | None | M | UX/supervision +1 | Second renderer auth/session bootstrap |
| 6 | Typed IPC codegen + validation | `ax-code-desktop` | Generate `desktop-ipc-contract.json` types; validate both directions in `preload-ipc-policy.js`; add channel table tests | None | M | Arch +1, security +0.5 | Contract drift; CI gate required |
| 7 | Split mega-files | `ax-code-desktop` | `ChatInput-impl.tsx` → composer/{model,attachments,queue,send}; `main.js` → windows/ipc/updater modules; delete cosmetic `-impl` re-export | None | L | Arch +1.5 | High-conflict refactor; do after e2e exists |
| 8 | Release pipeline + updater cutover | `ax-code-desktop` | Add `.github/workflows/desktop-release.yml` + packaged smoke (port OpenChamber `release-desktop-smoke.yml`) | None | L | Release +2 | Signing/notarization secrets; rollback proof |
| 9 | GitLab/Linear task import | Both: runtime server proxy + Desktop UI | Runtime: task-source adapters; Desktop: `web/server/lib/{gitlab,linear}` + board filters | New SDK methods `tasks.list/link` | M | Breadth +1 | Token storage; scope creep into PM |
| 10 | TUI plugin slot loader | `ax-code` | Implement `renderer-contract.ts` slots; load from config `plugin`; document API | Plugin UI-slot protocol | M | Arch/TUI +1 | Plugin safety (15 s deadline already exists) |
| 11 | TUI multi-project/location switch | `ax-code` | `context/location.tsx`, project switcher in sidebar, per-project session tree | None | M | TUI supervision +1.5 | Server URL/cwd switching correctness |
| 12 | Subagent transcript tab + terminal pane | `ax-code` | Promote `subagent-status-panel` to tabs; add `routes/session/terminal.tsx` using runtime terminal API | Runtime terminal stream (exists for Desktop) | M | UX +1 | PTY lifecycle in TUI |
| 13 | Perf contract CI | Both | Desktop: route/session budgets; TUI: execute `TUI_PERFORMANCE_CRITERIA` automated gates in CI | None | S | Perf +1 | Runner variance; use generous p95 |
| 14 | RTL locale foundation | `ax-code-desktop` | Add `ar` message pack + `direction` in i18n store; audit logical CSS | None | M | UX/breadth +0.5 | Layout debt across 14 locales |
| 15 | Desktop Storybook for `ui` | `ax-code-desktop` | Add Storybook config + stories for composer, mission control, diff | None | M | Arch/UX +0.5 | Maintenance; not before e2e |

### Sequencing

**Next 2 weeks:** #2 sandbox, #3 e2e skeleton, #13 perf gates, #1 TUI tabs, #4 worktree board start.
**Next 6 weeks:** #5 pop-out, #6 typed IPC, #7 mega-file split (behind e2e), #8 release pipeline, #12 TUI subagent/terminal, #15 storybook.
**Later:** #9 integrations, #10 TUI plugin loader, #11 multi-project, #14 RTL, mobile.
Cross-repo order: any new runtime data (#4 worktree endpoints, #9 task sources, #12 terminal stream) must land and publish SDK before Desktop consumption; TUI work is independent and can ship first.

### Do not copy

- **Orca's per-vendor agent adapters** (`src/main/{claude,codex,gemini,cursor,copilot,...}`): duplicates the runtime agent loop and violates the ownership boundary.
- **Orca's host/VM sprawl** (`ephemeral-vm-runtime-*`, SSH host tree): remote execution belongs to the runtime/host layer, not Desktop.
- **OpenCode's five-package desktop split** (`desktop/app/ui/session-ui/gui-extensions`): real value, but AX's three packages don't justify the boundary cost yet.
- **Effect-everywhere IPC**: adopt schema validation (#6) without requiring Effect in the renderer.
- **63 locales hand-maintained**: use a translation pipeline, not manual parity.

---

## Part 2 — Hermes Agent and OpenChamber

### 1. Upstream drift from OpenChamber

AX Desktop retains only `packages/{electron,ui,web}`; upstream has `{electron,extensions,mobile,sdk,ui,vscode,web}`.

| Feature | AX | OpenChamber | Status | Port? |
|---|---|---|---|---|
| Multirun auto-fusion | `types/multirun.ts` has no fusion; only a magic-prompt block `sections/magic-prompts/MagicPromptsPage.tsx:187` | `types/multirun.ts:21` `MultiRunAutoFusion`; `lib/multirun/autoFusion`; `MainLayout.tsx:186` `<RunAutoFusion/>` | **Missing** | Yes (Desktop UI only) |
| Agent manager | `supervision/MissionControl*`, `NeedsYouQueue.tsx` | `components/views/agent-manager/{AgentManagerView,Sidebar,EmptyState}.tsx` | **Missing but overlapped** | Partial — merge into MissionControl, don't add a second supervisor |
| Spaces (isolated project spaces) | None | `useUIStore.ts:940,1110` `spacesPageProjectId`/`isolatedSpacesEnabled`; `lib/spaces/space-route` | **Missing** | Later; runtime worktree isolation already exists |
| SSH manager | Only git identity key paths (`GitIdentityEditorDialog.tsx:77`) | `web/src/api/managed-ssh.ts` + tests | **Missing** | No — host execution is runtime-owned |
| Mobile | Responsive overlay only (`ui/.../MobileOverlayPanel.tsx`) | `packages/mobile/`, `web/src/mobile-main.tsx`, `mobile-release.yml` | **Missing** | Yes, as PWA first |
| VS Code extension | Not in Desktop repo | `packages/vscode/`, `vscode-extension.yml` | **Missing here** | No — runtime already has `packages/integration-vscode` |
| Issues & PRs | `views/GitHubBoardView.tsx:107`, i18n `githubBoard.title` | Full page + `github-references.ts` | **Present-but-different** | Add GitLab/Linear references only |
| Browser panel | `layout/ContextPanel-impl.tsx:1762`; `electron/src/desktop-webmcp-browser.js` | `server/lib/browser-control` | **Present** | No |
| Notification routing | Web Notification API (`web/src/api/notifications.ts:5-33`), `{worktree}` templating | `api/push.ts`, `usePushVisibilityBeacon` | **Partial** | Yes (push + visibility routing) |
| Release desktop smoke | No release workflow | `release-desktop-smoke.yml`, `release.yml` | **Missing** | Yes |
| GitLab/Linear | No `server/lib/gitlab` / `linear` | Both present | **Missing** | Yes (with runtime task API) |
| Extensions catalog | No `extensions/` | `packages/extensions/` | **Missing** | Later; runtime plugin surface first |

### 2. Hermes features we lack

| Feature | AX | Hermes evidence | Status | Port? |
|---|---|---|---|---|
| Fleet/profile rail | Projects only (`components/projects/ProjectsHome.tsx`) | `e2e/fleet-profile-rail.spec.ts`; `store/fleet-roster`; `settings/connections-registry.tsx:25` | **Missing** | Only if multi-gateway ships |
| Command center | `supervision/MissionControl.tsx`, `ui/AxCodeStatusDialog.tsx` | `app/command-center/index.tsx:48-153` (sessions/system/usage/maintenance) | **Partial** | Yes — session maintenance + usage tabs |
| Project groups | `ImportProjectsDialog`, MissionControl rows | `app/chat/sidebar/index.tsx:711` project groups; worktree grouping `:790` | **Partial** | Yes |
| Worktree ops | Create + settings only | `projects/worktree-dialog.tsx`; ordering/lineage in sidebar | **Partial** | Yes (ties to P1 #4) |
| Pop-out session windows | None (only dashboard `window.open`) | `store/windows`; `session-actions-menu.tsx:313`; `layout-constants.ts:26` | **Missing** | Yes |
| Native notifications | Web Notification API | `electron/notification-ipc.ts` (`new Notification`) | **Partial** | Yes |
| Preview with console | `web/server/lib/preview`; console unverified | Hermes preview/console surfaces | **Partial/unverified** | Verify before porting |
| MCP / skills / plugins | `sections/mcp`, `skills-catalog`, runtime plugins | Hermes plugins/skills | **Present-but-different** | No |
| Connectors | None | `types/hermes.ts:165` connectors; `connector_slug` | **Missing** | Yes (runtime-owned credentials) |
| Cron | Present: `web/server/lib/scheduled-task-convergence`, `components/session/scheduledTask*` | `types/hermes.ts:597-1091`; `app/routes.ts:20` | **Present** | No |
| Webhooks | None | `app/routes.ts:18`; `types/hermes.ts:430-474`; `webhooks-rest.test.ts` | **Missing** | Runtime ingress, Desktop viewer |
| Command palette | `ui/CommandPalette.tsx` | Hermes equivalent | **Present** | No |
| 9 locales + RTL | 14 locales, no Arabic/Hebrew | `i18n/ar*.ts` | **Missing RTL** | Yes (P1 #14) |
| Theme skins/accents | `CreateThemeDialog.tsx`, `ThemeSystemContext` | Hermes `themes/{skin,accents,user-themes}` | **Present** | No |
| Transcript windowing | `ui/src/sync/performance.ts`, session caches | Hermes virtualized recents (`sidebar/index.tsx:1455`) | **Present-but-different** | No |
| ~70 e2e + packaged/MSIX suites | None | `apps/desktop/e2e` 30+ visible; `playwright.config.ts`; `msix` target `electron-builder.config.cjs:236` | **Missing** | Yes (P1 #3) |
| MSIX + release channels | NSIS/zip only (`electron-builder.yml:115-123`) | `msix`, `stageChannelManifest` | **Missing** | Later |

### 3. Top 10 proposals from Hermes/OpenChamber only

| # | Proposal | Owner | Sketch | Contract | Effort | Score | Risk |
|---|---|---|---|---|---|---|---|
| 1 | Native pop-out session windows | `ax-code-desktop` | `electron/src/session-window.js` + `session-window.html`; menu action in `components/session/sidebar`; per-window store bootstrap | None | M | Supervision +2 | Multi-window auth/state sync |
| 2 | Release desktop smoke + e2e | `ax-code-desktop` | `.github/workflows/desktop-release.yml`; `e2e/packaged/{boot,update}.spec.ts` | None | L | Release +2 | Signing secrets; runner cost |
| 3 | Multirun auto-fusion | `ax-code-desktop` | Port `lib/multirun/autoFusion`; fuse control in `components/multirun/`; show merged output in `MultiRunCompare.tsx` | Runtime must return per-run outputs + a merge event | M | Breadth/UX +1 | Fusion semantics ambiguous; require explicit contract |
| 4 | Merge agent-manager into MissionControl | `ax-code-desktop` | Add per-agent detail pane + empty state from `AgentManagerView`; reuse `NeedsYouQueue` | None | M | Supervision +1 | Avoid a second supervisor surface |
| 5 | Push + notification host routing | `ax-code-desktop` | Port `api/push.ts` + visibility beacon; route per project/host in `NotificationSettings.tsx` | Runtime push subscription endpoint | M | UX +1 | Notification fatigue; opt-in defaults |
| 6 | Connectors + webhooks viewer | Both: runtime ingress, Desktop UI | Runtime: event ingress + credential refs; Desktop: `sections/connectors`, `views/webhooks` | New SDK `connectors.list`, `webhooks.list/deliveries` | L | Breadth +1.5 | Secret handling; must use AX Trust |
| 7 | Fleet/profile rail | Both | Runtime SDK exposes gateways; Desktop `components/fleet/ProfileRail` | `gateways.list/health` | L | Supervision +1 | Only valuable with multi-gateway reality |
| 8 | Mobile PWA | `ax-code-desktop` | Port `web/src/mobile-main.tsx` + `mobile.html`; reuse existing SSE/terminal | None | M | Breadth +1 | Offline/reconnect; auth |
| 9 | RTL + locale pipeline | `ax-code-desktop` | `ar` pack + `direction` in `lib/i18n/store.ts`; logical properties audit | None | M | UX +0.5 | CSS debt |
| 10 | Rich worktree dialog | `ax-code-desktop` | Port `worktree-dialog` patterns: create/remove/lock/switch, diff summary | Runtime worktree API (P1 #4) | M | Supervision +1 | Same as P1 #4; do once |

### 4. Do NOT copy

- **Hermes feature sprawl** (pets/particles/starmap, decorative HUD): no supervision value, large surface area.
- **Hermes' monolithic main process** (prior review: ~18k-line `main.ts`): AX should keep splitting `main.js`, not import the pattern.
- **Hermes billing/plans UI** (`settings/billing/plans-view.tsx`): AX Trust owns entitlements.
- **OpenChamber's full agent-manager as a parallel supervisor**: AX already has MissionControl/NeedsYou; duplicating creates two truth sources.
- **OpenChamber SSH manager and VS Code extension inside Desktop**: host execution and editor integration are runtime/other-repo ownership.
- **OpenChamber's multi-package/multi-platform release matrix before AX has one e2e suite**: sequencing risk, not capability.

### Bottom line

The prior scores are directionally right, but two claims need correcting: AX **does** have an editor and Linux packaging, and the TUI is **not** behind on themes, mouse, diff, permission UX, or documented long-session performance. The real TUI deficit is **multi-session/tabs, terminal pane, inline subagent inspection, plugin loading, and test volume**. Desktop's biggest deficits are **no e2e/visual CI, no release smoke, unsandboxed main renderer, no pop-out/mobile, and missing GitLab/Linear/connectors**. The OpenChamber fork has drifted in ways that matter (auto-fusion, agent manager, spaces, push routing, release smoke, mobile/vscode packages); port the UI-only pieces and leave host/SSH/VS Code ownership where it belongs.