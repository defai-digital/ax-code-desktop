# Contributing to AX Code Desktop

Thanks for helping. This guide covers setting up a checkout, running the app, the checks every change must pass and
the conventions reviewers look for. For directory ownership see [repository layout](../docs/repository-layout.md);
for every other reference see the [documentation index](../docs/README.md).

## Prerequisites

- **Node.js 26 or newer** (root `package.json` `engines`).
- **pnpm 10.33.4**, pinned in the root `package.json`. Run `corepack enable` so dependency resolution matches CI.
- **An `ax-code` binary** for development. The workspace never builds AX Code from a sibling checkout; set
  `AX_CODE_BINARY` or put `ax-code` on `PATH`. Packaged builds use the signed runtime pinned in
  `config/ax-code-runtime.json`.

```bash
git clone https://github.com/defai-digital/ax-code-desktop.git
cd ax-code-desktop
corepack enable
pnpm install
```

On Apple Silicon with newer Node versions, the optional `sharp` dependency can fall back to a source build that needs
libvips. If `pnpm install` fails while linking `vips-cpp`, run `brew install vips` and retry.

## Run the app

```bash
pnpm run dev
```

This launches the Electron app in development mode.

- **Quit any running AX Code app first.** Development shares its single-instance lock, so a second instance exits
  without opening a window.
- **Renderer port.** Vite tries loopback ports **31440–31449** (from `desktop/shared/dev-ports.json`) and reports the
  bound port before Electron starts. Startup fails if the whole range is busy. To pin one port (startup fails if it is
  taken):

  ```bash
  AX_CODE_DESKTOP_RENDERER_PORT=20000 pnpm run dev
  ```

- **Runtime supervision.** The Electron main process spawns and supervises the ax-code runtime and boots the web
  server in parallel. Set `AX_CODE_DESKTOP_SUPERVISE_RUNTIME=0` to let the web server spawn the runtime itself; the
  variable passes through `packages/electron/scripts/dev.mjs`.
- **API routing.** The Vite dev server classifies `/api`, `/global`, `/graph` and `/dre-graph` requests with the same
  longest-prefix table as the packaged `app://` handler (`packages/electron/src/api-prefix-router.js`). Runtime-shaped
  paths go straight to the runtime (with the `^/api` rewrite, the renderer Origin stripped and the per-boot credential
  injected); desktop-owned paths go to the web server. The web server publishes the runtime's loopback origin and
  credential to a dev-only `0600` file (`AX_CODE_DESKTOP_DEV_UPSTREAM_FILE`) that the Vite proxy
  (`packages/web/vite-api-runtime-proxy.ts`) re-reads, so no runtime port needs pinning. If that file is missing or
  the runtime is unreachable, every request falls back to the web server.
- **Keychain.** On macOS, development passes `--use-mock-keychain`, so a local run never creates or reads the app's
  Keychain item.

### Package-level scripts

| Command                                               | What it runs                                    | Default port         |
| ----------------------------------------------------- | ----------------------------------------------- | -------------------- |
| `pnpm --dir desktop/packages/web run dev:server`      | Express API and built static assets             | `3001`               |
| `pnpm --dir desktop/packages/web run dev:vite`        | Vite renderer with HMR                          | `31440`–`31449`      |
| `pnpm --dir desktop/packages/ui run type-check`       | Type-check the shared UI library (`dev` watches) | —                    |
| `pnpm --filter ax-code-desktop run start`             | Standalone web runtime (`ax-code-desktop serve`) | `3100`, scans upward |

Override the server port with `AX_CODE_DESKTOP_PORT` and the renderer port with `AX_CODE_DESKTOP_RENDERER_PORT`.
`packages/ui` has no dev server of its own; the web renderer consumes it as source.

## Before submitting

Run from the repository root. All must pass, including for documentation-only changes:

```bash
pnpm run check:boundaries   # import, IPC, endpoint, ownership, pin and release-policy contracts
pnpm run check:locales      # translation catalogs
pnpm run docs:validate      # MDX frontmatter, sidebar routes and platform policy
pnpm run typecheck
pnpm run lint
pnpm run test               # scripts, shared and every package, in sequence
pnpm run build
```

For UI changes, also verify the rendered result with fresh state and DOM evidence using the
[WebMCP development lab](../docs/development-webmcp.md). Run UI tests through `pnpm --dir desktop/packages/ui run test`
so they get the required Node options.

### Electron upgrades

Development and release builds pin stable Electron **45.2.3** (`packages/electron/package.json`). Public releases
require a stable engine. Package targets are macOS 13+ Apple Silicon, Windows x64 and Ubuntu Desktop 24.04+
amd64/arm64. After changing the Electron version, rebuild `node-pty` and run the engine smokes:

```bash
pnpm --filter @ax-code/electron run rebuild:native
pnpm run smoke:electron-compatibility
pnpm run smoke:native-webmcp
```

The Mission Control pop-out disables legacy webviews for a lighter renderer startup; workspace windows keep webview
support for the browser preview.

## Code style

- Functional React components only.
- TypeScript strict mode; no `any` without justification.
- Tailwind v4 for styling; typography via `packages/ui/src/lib/typography.ts`.
- Use the existing theme colors and typography from `packages/ui/src/lib/theme/`; do not add new ones.
- Components must support light and dark themes.
- Prefer early returns and `if/else`/`switch` over nested ternaries.
- Put user-facing strings in the i18n catalogs (`packages/ui/src/lib/i18n/messages`).
- Co-locate tests with the module they exercise.

## Branding and attribution

- Use **AX Code Desktop** for public product names, release text, screenshots and user-facing UI.
- Keep `openchamber` names only where compatibility with existing data, APIs, package internals or migration paths
  requires them.
- Do not remove upstream OpenChamber attribution from [NOTICE](./NOTICE). If a change imports or replaces code from
  another project, update `NOTICE` in the same pull request.

## Pull requests

1. Fork the repository and create a branch.
2. Make your change, with tests.
3. Run the checks in [Before submitting](#before-submitting).
4. Open a pull request that explains what changed and why.

Releases are cut by maintainers; see [release publishing](./docs/GITHUB_RELEASE_PUBLISHING.md). Security issues go to
[techsupport@defai.digital](mailto:techsupport@defai.digital), not a public issue (see [SECURITY.md](./SECURITY.md)).

## Not a developer?

You can still help:

- Report bugs or UX issues; even "this felt confusing" is valuable.
- Test on different OS versions and hardware.
- Suggest features or improvements via issues.
- Help others on [Discord](https://discord.gg/gf9UyPxaN2).

## Questions

Open an [issue](https://github.com/defai-digital/ax-code-desktop/issues) or visit [defai.digital](https://defai.digital).
