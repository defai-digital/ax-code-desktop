# Gap review: AX Code vs Orca and OpenCode (desktop + TUI)

STRICTLY READ-ONLY. Do not create, edit, delete, stage or commit any file in any repository. Do not run
builds, installs, tests or package scripts. Only read and search. Write your answer in English as your
final message.

## Repositories (absolute paths)

- AX Code Desktop (our Electron GUI): `/Users/akiralam/code/ax-code-desktop/desktop/packages/{electron,ui,web}`
  Governance: `/Users/akiralam/code/ax-code-desktop/AGENTS.md`
- AX Code runtime (our CLI + TUI + server + SDK): `/Users/akiralam/code/ax-code/packages/ax-code/src`
  TUI: `/Users/akiralam/code/ax-code/packages/ax-code/src/cli/tui` (routes, component, ui, context)
  SDK: `/Users/akiralam/code/ax-code/packages/sdk`; Governance: `/Users/akiralam/code/ax-code/AGENTS.md`
- Orca reference (Electron desktop + `orca` CLI + mobile): `/Users/akiralam/code/ax-code-desktop/.internal/reference/orca`
  (`src/main`, `src/renderer`, `src/cli`, `mobile/`)
- OpenCode reference: `/Users/akiralam/code/ax-code-desktop/.internal/reference/opencode/packages`
  Desktop: `desktop`, `app`, `ui`, `session-ui`, `gui-extensions`; TUI: `tui` (and `cli`, `core`)

## Ownership boundary (must respect)

The AX Code runtime owns coding tools, sessions, agent loop, worktree execution, verification, goal
contracts, the server API and the SDK. AX Code Desktop owns the portfolio UI, project registry, desired
state, exception inbox and project-management UX, and consumes the runtime only through the published SDK
and server API. Desktop must never duplicate runtime logic. If a desktop feature needs new runtime data or
an endpoint, say so and assign the runtime part to ax-code.

## Prior static scoring (weighted /100, 8 criteria)

| Project | Total | Breadth | Supervision | UX | Arch | Testing | Release | Perf | Security |
|---|---|---|---|---|---|---|---|---|---|
| Orca | 88 | 10 | 10 | 9 | 6 | 9 | 10 | 9 | 7 |
| OpenCode desktop | 83 | 8 | 7 | 9 | 9 | 8 | 9 | 9 | 8 |
| AX Code Desktop | 76.5 | 9 | 8 | 8 | 6 | 7 | 7 | 7 | 8 |

Known AX Code Desktop gaps from that review:
- 58 files over 1,000 lines (`ui/src/components/chat/ChatInput-impl.tsx` 4.9k, `web/server/lib/git/service.js`
  5k, `ui/src/components/views/FilesView-impl.tsx` 3.9k, `electron/src/main.js` 3.8k, untyped CommonJS
  Electron layer, `-impl` re-export split is cosmetic).
- No Playwright e2e or visual regression; some tests only pattern-match source text.
- Updater cutover pending; macOS arm64 only, Windows x64 only.
- `webviewTag: true`, CSP allows `script-src 'unsafe-inline'`, `runAsNode` fuse on, no explicit `sandbox`.
What Orca does better: worktree-as-core-unit, agent dashboard pop-out window, mobile companion, ~700 e2e,
perf-contract CI, integrations (GitHub/GitLab/Jira/Linear tasks), browser pane, editor.
What OpenCode does better: Effect-Schema-validated typed IPC, layered main process, design-system packages +
storybook, 63 locales, custom timeline virtualizer + workers + perf benchmarks, sandbox:true.

The TUI was not scored yet. Compare the AX Code TUI with the OpenCode TUI (and Orca's CLI where relevant;
Orca has no TUI, so note what its CLI offers for agent supervision).

## What to deliver

Verify the gaps above against the code (correct anything wrong), then produce an improvement proposal:

1. **Desktop gap table** vs Orca and OpenCode: capability, AX state (with file evidence), reference
   evidence (file path), impact on score/users.
2. **TUI gap table** vs OpenCode TUI: same columns. Cover e.g. session switching, sub-agent view,
   diff/review, permission UX, themes, keybinds, mouse, performance with long sessions, multi-session
   or multi-project supervision from the terminal, plugin/extension surface, tests.
3. **Ranked improvement proposals** (top 12-15). For each: title, owner repo (`ax-code`, `ax-code-desktop`,
   or both with the split), why, concrete design sketch (files/modules to add or change), runtime/SDK
   contract changes needed, effort (S/M/L), expected score impact, dependencies, risks.
4. **Sequencing**: 3 phases (next 2 weeks / next 6 weeks / later), noting cross-repo ordering
   (runtime + SDK release before desktop consumption).
5. Anything in Orca or OpenCode you think we should explicitly NOT copy, and why.

Be concrete and critical. Cite file paths for every claim. Keep it under 2,500 words.

---

# PART 2: Hermes Agent and OpenChamber (answer in the same final message, after part 1)

Extra references: Hermes Agent `/Users/akiralam/code/ax-code-desktop/.internal/reference/hermes-agent` (desktop GUI `apps/desktop`), OpenChamber (our upstream fork source) `/Users/akiralam/code/ax-code-desktop/.internal/reference/openchamber`.

## Prior static scores (/100)

Hermes desktop 79.5 (breadth 9, supervision 8, UX 9, arch 5, testing 9, release 9, perf 7, security 7).
OpenChamber 77.5 (breadth 9, supervision 9, UX 8, arch 5, testing 8, release 9, perf 7, security 6).
AX Code Desktop 76.5 (breadth 9, supervision 8, UX 8, arch 6, testing 7, release 7, perf 7, security 8).
Hermes noted features: command center, fleet profile rail, project groups, git worktree ops, pop-out
session windows, native notifications, preview with console, MCP/skills/plugins/connectors, cron,
webhooks, command palette, 9 locales with RTL, theme skins/accents, transcript windowing, ~70 Playwright
e2e incl. auto-update and packaged-build suites, MSIX, release channels.
OpenChamber noted features: agent manager, multirun lanes with fusion dialog, worktrees and spaces view,
notification host routing, SSH manager, mini-chat, PR view, browser preview, mobile and VS Code pipelines,
notarization verified in CI, release desktop smoke.

## Task

1. **Upstream drift (OpenChamber)**: we forked OpenChamber. Find features, fixes or surfaces that OpenChamber
   has now and AX Code Desktop does not (removed by us, never merged, or added upstream after the fork). Check
   e.g. multirun fusion, SSH manager, spaces, agent manager, mobile, VS Code extension, PR view, browser panel,
   notification routing, release smoke. For each say: missing / partial / present-but-different, with
   evidence on both sides, and whether we should port it (some were removed on purpose because the runtime
   boundary forbids them; say if so).
2. **Hermes features we lack**: desktop GUI features (and, where relevant, runtime/TUI features such as
   cron, webhooks, connectors, gateway/messaging, ACP, profiles/fleet) that AX Code Desktop or the AX Code
   runtime/TUI lack. Same evidence and port/skip recommendation.
3. **Proposals**: top 10 improvements from these two sources only, each with owner repo (`ax-code`,
   `ax-code-desktop`, or both with the split), design sketch (files to add/change), SDK/server contract change,
   effort S/M/L, expected score impact, risk.
4. **Do NOT copy** list with reasons (e.g. Hermes feature sprawl such as pets/particles/starmap, 18k-line
   main.ts).

Cite file paths for every claim. Under 2,000 words.

Total answer for both parts: under 3,500 words.
