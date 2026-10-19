# Supplementary gap review: AX Code Desktop vs Hermes Agent and OpenChamber

Read-only review. No files changed. Scores cited are the prior static scores supplied in the brief.

## 1. Upstream drift: OpenChamber → AX Code Desktop

Fork point matters: our tree kept `@openchamber/ui` naming (`desktop/packages/ui/package.json`) and restructured `packages/electron/*.mjs` into `desktop/packages/electron/src/*.js`, so absence below was verified by directory comparison, not name search alone.

- **Multirun fusion — Partial.** Both have `MultiRunFusionDialog.tsx` (`desktop/packages/ui/src/components/multirun/`, `packages/ui/src/components/multirun/`). Upstream adds `AskOtherModelsDialog.tsx`, `RunLaneCard.tsx`, `RunOverview.tsx`, `LaneStatusIcon.tsx`, `ModelEffortMenu.tsx`; we add launcher/fusion tests but no lane overview. **Port the lane overview only** (`ax-code-desktop`); fusion execution stays in `ax-code`.
- **SSH manager / Remote Instances — Missing.** Upstream: `packages/ui/src/stores/useDesktopSshStore.ts`, `components/sections/remote-instances/RemoteInstancesPage.tsx`, `components/sections/openchamber/ManagedSshCredentials.tsx`. Ours: no `remote-instances` section, only `sections/git-identities/`. **Skip for now.** Credential custody conflicts with our AGENTS.md rule against storing raw credentials; any remote attach must be a runtime-owned SDK capability first.
- **Spaces — Missing, worktrees partial.** Upstream: `components/sections/openchamber/IsolatedSpacesSettings.tsx`, `SpacePlacesSettings.tsx`, `spacePlacesDisk.ts`. Ours: only `components/sections/ax-code/WorktreeSectionContent.tsx` plus runtime worktree execution. **Skip as Desktop feature.** Desired-state UX may visualise runtime worktrees; it must not grow a second space manager.
- **Agent Manager — Present-but-different.** Upstream: `components/views/agent-manager/AgentManagerView.tsx`, `AgentGroupDetail.tsx`. Ours replaces it with `components/supervision/missionControl/MissionControl.tsx`, `MultiRunCompare.tsx`, exception inbox (`NeedsYouPopover.tsx`). **Do not port.** Our supervision model is the intended superset; backfill only grouping parity if users miss it.
- **Mobile — Missing.** Upstream `packages/mobile/` (Capacitor `android/`, `ios/`) + `.github/workflows/mobile-ci.yml`, `mobile-release.yml`, `packages/web/mobile.html`. Ours: `desktop/packages/{electron,ui,web}` only. **Skip.** Outside Desktop charter; would dilute release evidence still pending.
- **VS Code extension — Missing.** Upstream `packages/vscode/`, `packages/extensions/`, `.github/workflows/vscode-extension.yml`. Ours has none; runtime has `packages/ax-code/src/ide/`. **Owner is `ax-code` if ever revived; Desktop must not own it.** Low priority.
- **PR view — Present.** Upstream `components/github/GitHubAccountControl.tsx` + `stores/useGitHubPrStatusStore.ts`. Ours: `components/views/git/PullRequestSection.tsx`, `GitHubBoardView.tsx`, `components/session/GitHubPrPickerDialog.tsx`. **No port needed**; track upstream picker fixes opportunistically.
- **Browser panel — Missing.** Upstream `components/browser/BrowserPane.tsx`, `BrowserToolbar.tsx` + `packages/electron/browser-panel-*.mjs` (cookies, security). Ours has no `components/browser/`; instead `components/mcp/WebMcpHeaderButton.tsx` and Electron `desktop-webmcp-browser.js` (WebMCP capture, ADR-169 direction). **Port as preview-only panel in Desktop, with navigation policy owned via runtime `browser-workflow/` contract; do not copy cookie handling wholesale.**
- **Notification host routing — Partial.** Upstream `packages/electron/notification-host-routing.mjs` (+ test). Ours: rich UI (`components/notifications/NotificationCenter.tsx`, `PermissionNotifications.tsx`) but no `*notif*` Electron host-routing module. **Port the routing layer (`ax-code-desktop` Electron); event source stays runtime `notification/events.ts`.**
- **Release smoke — Partial.** Upstream `.github/workflows/release-desktop-smoke.yml` (signed/notarised macOS, Windows, Linux). Ours: `.github/workflows/desktop-ci.yml`, `desktop-shadow.yml` only; AGENTS.md records signed shadow/upgrade/rollback evidence still pending, `config/desktop-release-policy.json` stage `cutover-approved`. **Port the smoke shape, not the workflow verbatim.**
- Also diverged by design: upstream `sections/{classification,routing,integrations}`, `components/{dictation,diagram,sourceBoard}` have no counterpart; we renamed `openchamber` settings to `sections/ax-code/` (`AXCodePage.tsx`). Dictation/diagram are **skip**; source-board overlaps our GitHub board.

## 2. Hermes features we lack

Hermes desktop (`apps/desktop/src/app/*`, `apps/desktop/electron/*`, 18,474-line `electron/main.ts`) is broader but architecturally looser.

- **Command Center — Missing.** Hermes `app/command-center/index.tsx` (sessions/system/usage/maintenance, gateway restart, log tail). Ours has supervision Mission Control, no system-ops center. **Highest-value port** (see Proposal 1).
- **Fleet profile rail / profiles — Missing.** Hermes `app/profiles/` (create/rename/delete dialogs) + `e2e/fleet-profile-rail.spec.ts`. Ours assumes one signed runtime per `axcode-runtime-supervisor.js`. **Skip multi-backend fleet; port profile-as-project-group labelling only.**
- **Pop-out session windows — Missing.** Hermes `app/chat/browser-popout-shell.tsx`, `preview-tile.tsx`. Ours has only `components/views/MultiRunWindow.tsx`. **Port (Proposal 4).**
- **Preview with console — Missing.** Hermes chat preview tiles + `app/artifacts/`. Ours has no embedded preview/console. Combined with OpenChamber browser gap above — same proposal.
- **Connectors — Missing; MCP/skills/plugins present.** Hermes `app/capabilities/{connectors,mcp,plugins,skills,toolsets}`. Ours matches on `sections/{mcp,skills,plugins}` and runtime `src/{mcp,skill,plugin}/`, but has no connector-account surface. **Port read-only connector status via SDK; account OAuth stays runtime-owned.**
- **Cron — Present, thinner UX.** Runtime is strong: `packages/ax-code/src/session/scheduled-task.ts`, `scheduled-task-schedule.ts`, `src/tool/schedule.ts`; Desktop has `ScheduledTaskEditorDialog.tsx`, `ScheduledTaskRunHistoryDialog.tsx`. Hermes adds blueprint catalog (`cron/blueprint_catalog.py`, `app/cron/blueprints.tsx`) and delivery queue. **Port blueprints/templates only.**
- **Webhooks — Missing.** Hermes `app/webhooks/`, `gateway/delivery*.py`. Runtime grep shows webhook only inside `cli/cmd/github-agent/` prompts; no ingress route in `src/server/`. **Runtime-owned proposal (Proposal 5); Desktop shows status only.**
- **Gateway / messaging (Telegram etc.) — Missing.** Hermes `gateway/` (40+ modules), `app/messaging/telegram-qr-setup.tsx`. **Skip.** Messaging gateway violates the coding-runtime boundary; AX Agent/Trust own durable runs and credentials.
- **ACP — Present-but-different.** Ours `packages/ax-code/src/acp/` (TS, server-integrated) vs Hermes Python `acp_adapter/`. **No port; keep ours.**
- **Locales/RTL — Partial.** Ours ships 13 locales (`lib/i18n/messages/{de,es,fr,id,it,ja,ko,pt-BR,ru,tr,vi,zh-CN,zh-TW}.json`) vs Hermes 9 (`apps/desktop/src/i18n/`) but Hermes includes Arabic with RTL; we have no `ar` and no RTL handling found. **Port RTL + `ar` (Proposal 7).**
- **Theme skins/accents — Partial.** Ours `contexts/ThemeSystemContext.tsx`, `sections/ax-code/CreateThemeDialog.tsx`. Hermes `themes/presets.ts`, `accents.ts`, `classic-skin`. **Port accent presets only.**
- **Transcript windowing — Present-but-different.** Hermes explicit `app/chat/history-window.ts` (`HISTORY_WINDOW_LIMIT = 120`, around-fetch). Ours virtualises (`components/chat/MessageList.virtualization.test.tsx`) without an around-window API. **Port the around-fetch contract if long-session jumps feel slow.**
- **E2E / release — Hermes ahead.** Hermes `apps/desktop/e2e/` (~70 Playwright specs incl. update/packaged suites per brief) + Tauri `apps/bootstrap-installer/` + MSIX/app-installer checks (`electron/appinstaller-checker.ts`). Ours: Vitest-heavy, no Playwright e2e dir found, updater `components/update/AxCodeUpdateToast.tsx` without channel UI. **Port e2e smoke + update channels (Proposals 2, 6).**

## 3. Top 10 proposals (from these two sources only)

### 1. Command Center (system + usage + sessions)
Owner: both — `ax-code` exposes status/usage/log endpoints; `ax-code-desktop` renders. Sketch: new `desktop/packages/ui/src/components/supervision/CommandCenter.tsx` beside `MissionControl.tsx`; runtime `src/server/` routes over existing `stats/`, `notification/`. Contract: SDK `GET /command-center/status`. Effort M. Impact +2 supervision/release. Risk: low; read-only first.

### 2. Packaged-build Playwright smoke
Owner: `ax-code-desktop`. Sketch: `desktop/packages/electron/e2e/` modelled on Hermes `apps/desktop/e2e/boot.spec.ts` + OpenChamber `release-desktop-smoke.yml`; wire into `desktop-shadow.yml`. No SDK change. Effort M. Impact +2 release/testing. Risk: CI minutes, signing secrets.

### 3. Embedded browser preview with console
Owner: both — Desktop `components/browser/` (adapt OpenChamber `BrowserPane.tsx`); runtime `src/browser-workflow/` owns navigation policy. Contract: SDK preview-session events. Effort L. Impact +2 breadth/UX. Risk: webview security; reuse OpenChamber `browser-panel-security.mjs` policy tests.

### 4. Pop-out session windows
Owner: `ax-code-desktop`. Sketch: generalise `MultiRunWindow.tsx`; Electron `desktop-window-chrome.js` gains session-window factory. No contract change (existing SSE). Effort M. Impact +1 UX/supervision. Risk: state sync across windows.

### 5. Webhook ingress + delivery status
Owner: `ax-code` (`src/server/` webhook route, `workflow/routine.ts` trigger), Desktop inbox badge only. Contract: new SDK webhook resource + `NotificationEvent` delivery variant. Effort M. Impact +1 breadth. Risk: auth/abuse; sign payloads, no credential storage in Desktop.

### 6. Update channels (stable/beta) with blocker UI
Owner: `ax-code-desktop`. Sketch: Hermes `app/updates-overlay.tsx` pattern over our `desktop-update-feed.js`, `AxCodeUpdateToast.tsx`; policy in `config/desktop-release-policy.json`. Effort M. Impact +1 release. Risk: must not precede signed shadow evidence (ADR-012 gate).

### 7. Arabic locale + RTL
Owner: `ax-code-desktop`. Sketch: `lib/i18n/messages/ar.json`, `dir` handling in `App.tsx`, mirror Hermes `i18n/languages.ts` registry test. Effort M. Impact +1 UX. Risk: layout mirroring bugs in chat/diff views.

### 8. Cron blueprints (schedule templates)
Owner: both — runtime template store beside `session/scheduled-task.ts`; Desktop picker in `ScheduledTaskEditorDialog.tsx`. Contract: SDK scheduled-task `templateId`. Effort S. Impact +1 breadth. Risk: low.

### 9. Notification host routing
Owner: `ax-code-desktop` Electron (port `notification-host-routing.mjs` logic into `src/`), runtime event taxonomy unchanged. Effort S. Impact +1 supervision. Risk: OS permission differences per platform.

### 10. Accent presets + transcript around-window
Owner: split — Desktop `ThemeSystemContext` accent presets (Hermes `themes/accents.ts`); runtime SDK around-read for `MessageList` (Hermes `history-window.ts`). Effort S/M. Impact +1 UX/perf combined. Risk: theme contrast regressions; gate with existing `appThemeRegistry.test`.

## 4. Do NOT copy

- **Pets, pet generation, starmap, particles** (`apps/desktop/src/app/{pet-overlay,pet-generate,starmap}`): feature sprawl, zero coding-supervision value.
- **18k-line Electron `main.ts`** (Hermes) and OpenChamber's 6,507-line `packages/electron/main.mjs`: our modular `desktop/packages/electron/src/*.js` (3,826-line main plus tested policy modules) is the better architecture (our arch 6 vs their 5). Port behaviours, never the monolith.
- **Python gateway/messaging fleet** (Hermes `gateway/`, Telegram bots): duplicates AX Agent durable runs and AX Trust credentials; boundary violation.
- **Multi-backend fleet profiles**: conflicts with pinned signed runtime model (`config/ax-code-runtime.json`).
- **OpenChamber mobile + VS Code pipelines as Desktop work**: separate products; Desktop release evidence is already the bottleneck.
- **SSH credential manager**: until runtime owns SSH via SDK, Desktop storing SSH credentials breaks the no-raw-credentials rule.
- **Tauri bootstrap installer** (Hermes `apps/bootstrap-installer/`): second installer stack beside Electron Builder; MSIX only if Windows Store distribution is ever approved.
