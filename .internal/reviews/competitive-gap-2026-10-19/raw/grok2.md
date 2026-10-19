I'll compare AX Code Desktop and the runtime against OpenChamber and Hermes, read-only, and start from the governance docs and the surfaces already called out.The trees are large, so I’ll map the named surfaces on both sides and only then decide what is missing, partial, or deliberately out of bounds.OpenChamber is at 2.5.0. AX Code Desktop already has the portfolio surfaces that matter (mission control, multi-run fusion, worktrees, command palette, native notifications, themes, 14 locales). The real gaps are a few upstream UX slices we retired or never took, Hermes’s session pop-out and preview console, and Hermes’s Playwright release net. Several large Hermes and OpenChamber surfaces are a second runtime or a chat-platform product and should stay out.

## 1. Upstream drift (OpenChamber 2.5.0)

| Surface | Status | Evidence | Port? |
| --- | --- | --- | --- |
| Multi-run fusion | Partial | Both have a fusion dialog. Ours: `desktop/packages/ui/src/components/multirun/MultiRunFusionDialog.tsx`, compare overlay `components/supervision/MultiRunCompare.tsx`. Theirs adds lane cards, keep/detach/archive, and “ask other models”: `reference/openchamber/packages/ui/src/components/multirun/RunLaneCard.tsx`, `AskOtherModelsDialog.tsx`. Changelog `changelog/2.0.3.md` says this replaced Agent Manager. | Yes, UI only, on the existing multi-run store. |
| Agent Manager | Present-but-different | Upstream retired the named panel in 2.0.3. Our settings still have `components/sections/agents/AgentsPage.tsx`. Parallel runs live in multi-run, not a separate manager. | No. |
| SSH manager | Missing on purpose | Upstream `packages/electron/ssh-manager.mjs` (1,702 lines) installs OpenCode over SSH. We retired the page: `RETIRED_SETTINGS_SLUGS` includes `remote-instances` in `desktop/packages/ui/src/lib/settings/metadata.ts`. `desktop-hosts.js` only normalizes a URL. Leftover copy remains in `en.settings.ts`. | No. It bootstraps a foreign runtime. A remote AX Code server, if ever needed, attaches by URL through the SDK. |
| Isolated spaces | Missing on purpose | `packages/ui/src/components/session/spaces/NewSpaceDialog.tsx` plus `packages/electron/space-preview.mjs`. Docker place, network, and model-key grant. No `spaces` matches under our `desktop/packages`. | No. A second execution runtime. Worktrees stay in `ax-code` `src/tool/worktree.ts`. |
| Mobile | Missing | `packages/mobile/` Capacitor iOS/Android shell. No mobile package in AX Code Desktop. | No for this repo. A phone shell is a new product, not a desktop port. |
| VS Code | Present-but-different, other repo | Theirs: `packages/vscode/README.md` (multi-model tab, commit message, editor session). Ours: `ax-code/packages/integration-vscode/` (sidebar agent, explain/fix/review, `@` files, TUI launch). Desktop must not grow an extension. | Small follow-ups belong in `ax-code` only. |
| PR view | Partial | Theirs: `ReviewFlowDialog.tsx`, `usePullRequestComparison`, mobile Changes/PR selector in `packages/mobile/README.md`. Ours: `GitHubBoardView.tsx`, `GitHubPrPickerDialog.tsx`, `useGitHubPrStatusStore.ts`, `lib/git/prWorktreeConfig.ts`. | Yes for a comparison selector on the board we already have. |
| Browser / preview | Present-but-different | Theirs: `components/browser/BrowserPane.tsx` and `browser-panel-*.mjs` (cookies, device bar, annotations). Ours: iframe preview plus WebMCP browser in `ContextPanel-impl.tsx`, `EmbeddedWebMcpBrowser.tsx`, `webview-policy.js`. No preview console. | Port the console, not their cookie partition. |
| Notification host routing | Missing, low value now | Theirs: `notification-host-routing.mjs` opens the session on the owning host. Ours: `main.js` `maybeShowNativeNotification` focuses the main window and passes `sessionId`. | No while remote instances stay retired. |
| Release smoke | Present-but-different | Theirs: `.github/workflows/release-desktop-smoke.yml` (dispatch, notarization check). Ours: unsigned smoke in `desktop-ci.yml`; signed `codesign`/`spctl` path in `desktop-shadow.yml`. `electron-builder.yml` has `notarize: true`. | No feature port. Finish the signed-receipt gate already in AGENTS.md. |
| Also only upstream | Missing | Quake dropdown `quake-mode.mjs`. RTL for `ar`/`he` in `packages/ui/src/lib/i18n/runtime.ts` (`documentElement.dir`). Source board `components/sourceBoard/`. Linear picker. Dictation. Pairing deep link, relay tunnel, Linux autostart, theme file picker. Extensions registry `packages/extensions/`. | RTL is the only one worth scheduling. The rest is host-product or scope. |

Locales we already ship (14, all LTR): `desktop/shared/locales.json`. Our i18n forces LTR in `desktop/packages/ui/src/lib/i18n/context.tsx`.

## 2. Hermes features we lack

Desktop GUI root: `reference/hermes-agent/apps/desktop/`. `electron/main.ts` is 18,474 lines. Our `desktop/packages/electron/src/main.js` is 3,826.

| Feature | Status | Evidence | Port? |
| --- | --- | --- | --- |
| Command center | Partial | Theirs: `src/app/command-center/index.tsx` (sessions, system, usage, maintenance, log files). Ours: `components/supervision/MissionControl.tsx`. Server `POST /log` in `ax-code/src/server/routes/app.ts` writes a line. It does not tail. | A local log tail only. Usage dollars stay out (AX Trust). |
| Fleet profile rail | Missing | `src/app/chat/sidebar/fleet-rail.ts`, `profiles/index.tsx` (SOUL edit, create/rename/delete). | No. Separate agent homes and a gateway roster. Our portfolio is projects, not profiles. |
| Project / worktree groups | Partial | Their sidebar is a thin render of backend `projects.tree`: `sidebar/projects/workspace-groups.ts`, `worktree-dialog.tsx`. Ours: `ProjectsHome.tsx`, `NewWorktreeDialog.tsx`, runtime `src/tool/worktree.ts` and `src/mode/worktree-policy.ts`. | Optional lane grouping in the session sidebar. Membership stays in the runtime. |
| Session pop-out | Missing | `electron/session-windows.ts`: one extra OS window per chat, shared webPreferences, throttling while a turn runs. We only have a generic second window, `createAdditionalWindow` in `main.js`, plus wiki and mini-chat. | Yes, as a small Electron module. Do not grow `main.js` into their monolith. |
| Native notifications | Present | `main.js` `maybeShowNativeNotification`. | No. |
| Preview console | Missing | `src/app/chat/right-rail/preview-browser-bar.tsx`, `preview-console-state`. Our `ContextPanel-impl.tsx` has an iframe and no console toggle. `PreviewToggleButton.tsx` is edit vs preview for a document. | Yes. |
| MCP / skills / plugins / connectors | Present-but-different | Theirs: capabilities tab and connectors (`src/app/routes.ts`). Ours: settings slugs `mcp` and `skills.installed` in `metadata.ts`. `PluginsPage.tsx` is not mounted. `plugins` is a retired settings slug. | Keep MCP and skills. Do not import `plugin-catalog/` (720 YAML files) or OAuth app connectors. |
| Cron | Present-but-different | Theirs: `src/app/cron/` plus Python `cron/` with chat delivery. Ours: `ax-code/src/session/scheduled-task.ts`, `src/server/routes/scheduled-task.ts`, desktop `ScheduledTaskEditorDialog.tsx` and run history. | No messaging delivery. |
| Webhooks | Missing, gated | Theirs: `src/app/webhooks/index.tsx`. Ours: `workflow/spec.ts` rejects an enabled webhook routine until remote security gates ship. | Runtime work later. Not an Electron listener. |
| Command palette | Present | `useUIStore-impl.ts` `isCommandPaletteOpen`. | No. |
| Locales and RTL | Partial | Their bundled nine: `src/i18n/catalog.ts` (`en`, `zh`, `zh-hant`, `ja`, `ar`, `ru`, `fr`, `de`, `es`). RTL set is `ar` in `apps/shared/src/i18n.ts`. We have 14 LTR locales and no `ar`. | RTL only if we add `ar` or `he`. |
| Theme skins | Present | Theirs: `src/themes/presets.ts` (Nous, Catppuccin, Everforest, Solarized). Ours: `lib/theme/themes/presets.ts` including Catppuccin, plus `generateTheme.ts` base and accent. | No. |
| Transcript windowing | Present-but-different | Theirs: token slice `src/app/chat/transcript-window.ts`. Ours: per-turn reveal `TurnMessageWindow.tsx` and `MessageList.virtualization.test.tsx`. | No, unless a long-session profile says turns still mount too much. |
| Git worktree ops | Present | Runtime tools above. Desktop create dialog. | No new runtime. |
| Playwright | Missing | 58 `*.spec.ts` under `apps/desktop/e2e/` (boot, fleet rail, transcript, packaged smoke, `e2e/update/`). Our desktop CI is Vitest plus `smoke:*` scripts. No Playwright specs. | Yes, a short suite, not all 58. |
| MSIX and channels | Missing | `electron-builder.config.cjs` targets `msix` and canary feeds. Ours: DMG, NSIS, zip, AppImage, deb in `electron-builder.yml`. Windows is x64 NSIS, one `latest.yml` channel. | Canary later. Skip MSIX. |
| ACP | Present-but-different | Theirs: `acp_adapter/entry.py` (gateway commands, elicitation). Ours: `ax-code/src/cli/cmd/acp.ts` and `src/acp/agent`. | No desktop copy. |
| Gateway / messaging | Missing | `src/app/messaging/index.tsx` (Telegram, Discord, Slack, Signal, WhatsApp) and `gateway/`. | No. That is a bot host. Model access stays in AX Trust. |

## 3. Top 10

Scores are the prior dimension notes. Overall 76.5 moves only if testing and release actually land.

1. **Playwright smoke.** Owner: `ax-code-desktop`. New `desktop/e2e/` for boot, open session, exception inbox, update toast. No SDK change. **L.** Testing 7 to about 8.5. Risk: flake and CI minutes. Copy their harness shape (`e2e/core/`), not the suite.
2. **Preview console.** Owner: desktop. Extend `ContextPanel-impl.tsx` with a console buffer and toggle, kept inside `webview-policy.js`. No SDK change. **M.** UX about +0.5. Risk: a webview that escapes the current capture policy.
3. **Session pop-out.** Owner: desktop. New `desktop/packages/electron/src/session-windows.js`, called from the existing additional-window path. Same server origin, so no SDK change. **M.** Supervision and UX about +0.3. Risk: two sync clients and background timer throttling. Keep the logic out of `main.js`.
4. **Multi-run lane actions.** Owner: desktop. Extend `MultiRunCompare.tsx` and `lib/supervision/multiRunGroups.ts` with keep, diff, and archive. “Ask other models” calls `useMultiRunStore` `createMultiRun`. Worktree delete stays on `worktree_remove`. **M.** Supervision 8 to about 8.5. Risk: archiving a lane that still holds a worktree.
5. **PR comparison on the board.** Owner: desktop. A selector next to `GitHubBoardView.tsx` using `GitHubPullRequestContextResult` and `prWorktreeConfig.ts`. **M.** UX about +0.3. Risk: token scope. Add a server route only if the context payload cannot name the base ref.
6. **RTL.** Owner: desktop. Direction from locale in `lib/i18n/runtime.ts` and `context.tsx` (today `dir` is hardcoded `"ltr"`). Add `ar` only with a full catalog. **M.** Small breadth/UX gain. Risk: mirrored panes and the titlebar.
7. **Local log tail.** Owners: both. `ax-code`: a read-only tail beside write-only `POST /log` in `server/routes/app.ts`, then SDK regen. Desktop: a Mission Control diagnostics pane. **M.** Supervision about +0.3. Risk: secrets in log lines. This is not an AX Telemetry product and not Hermes usage analytics.
8. **VS Code multi-model and commit message.** Owner: `ax-code` `packages/integration-vscode/` only. Call the published session and multi-run APIs. **M.** Editor breadth, desktop score unchanged. Risk: a second UI stack inside the extension.
9. **Canary feed.** Owner: desktop, after the signed shadow receipts in AGENTS.md. `desktop-update-feed.js` plus a second electron-builder channel. **M.** Release 7 to about 8. Risk: a canary build that shares stable `userData`.
10. **Webhook routines.** Owner: `ax-code`. The gate is already in `workflow/spec.ts`. A loopback receiver with a signed secret, still default-off. Desktop gets a switch only after that route exists. **L.** Little score until it is safe. Risk: an open ingress. Do not listen in Electron.

## 4. Do not copy

- **Hermes pets, particles, starmap, pet overlay.** `src/app/pet-overlay/pet-overlay-app.tsx` and `src/app/starmap/`. Mascot windows, not supervision.
- **The 18,474-line `electron/main.ts`.** Session windows, pet IPC, and updater already sit in side files there because the monolith drifted. Our split (`session` windows, `webview-policy.js`, `desktop-update-feed.js`) is the constraint to keep.
- **Fleet profiles, SOUL files, and the profile rail.** A second identity and config plane beside the project registry.
- **Gateway rooms and messaging platforms.** Telegram through WhatsApp in `messaging/index.tsx`, canonical groups in `docs/canonical-groups.md`. Chat-bot hosting. Model gateway stays AX Trust. Cron delivery to those chats stays out. Our scheduler already runs.
- **Connector and plugin catalogs.** `plugin-catalog/` and the OAuth connector page. We already edit MCP and skills through the runtime.
- **MSIX.** Store packaging. NSIS plus zip is the Windows channel (`electron-builder.yml`, runtime ADR-185 AMD64).
- **OpenChamber SSH manager and isolated spaces.** Retired remote-instances slug. `ssh-manager.mjs` provisions OpenCode. Spaces grant model keys into another machine. Both duplicate execution the desktop is forbidden to own.
- **OpenChamber mobile, extension marketplace, Linear, dictation, Quake, pairing, and relay.** Large host-product surfaces. Quake is a small hotkey, and it still loses to the ten items above.
- **Dollar usage and a desktop observability product.** Command-center usage periods. Tokens may show from the runtime. Money and fleet analytics do not.

Net: breadth is already close. The score that can move is testing (Playwright) and, after signed receipts, release channel. The UX worth taking is preview console, session pop-out, and the multi-run lane actions OpenChamber added after the Agent Manager rename.
