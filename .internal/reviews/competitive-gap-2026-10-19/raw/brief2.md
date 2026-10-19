# Supplementary gap review: features we lack vs Hermes Agent and OpenChamber

STRICTLY READ-ONLY. Do not create, edit, delete, stage or commit any file in any repository. Do not run
builds, installs, tests or package scripts. Only read and search. Write your answer in English as your
final message.

## Repositories (absolute paths)

- AX Code Desktop (ours, Electron, forked from OpenChamber): `/Users/akiralam/code/ax-code-desktop/desktop/packages/{electron,ui,web}`
  Governance: `/Users/akiralam/code/ax-code-desktop/AGENTS.md`
- AX Code runtime (ours: CLI, TUI, server, SDK): `/Users/akiralam/code/ax-code/packages/ax-code/src`
  (TUI in `src/cli/tui`), SDK `/Users/akiralam/code/ax-code/packages/sdk`, governance `/Users/akiralam/code/ax-code/AGENTS.md`
- Hermes Agent reference: `/Users/akiralam/code/ax-code-desktop/.internal/reference/hermes-agent`
  (desktop GUI `apps/desktop` (Electron + React; `src/app/*`, `electron/*`), `apps/shared`, Tauri installer
  `apps/bootstrap-installer`, plus Python agent, `hermes_cli`, `gateway`, `cron`, `acp_adapter`)
- OpenChamber reference (our upstream): `/Users/akiralam/code/ax-code-desktop/.internal/reference/openchamber`
  (`packages/ui`, `packages/web`, `packages/electron`, plus any mobile/VS Code packages)

## Ownership boundary (must respect)

The AX Code runtime owns coding tools, sessions, agent loop, worktree execution, verification, goal
contracts, scheduling execution, server API and SDK. AX Code Desktop owns the portfolio UI, project registry,
desired state, exception inbox and project-management UX, and consumes the runtime only through the published
SDK/server API. Desktop must never duplicate runtime logic. Assign runtime parts to `ax-code`.

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
