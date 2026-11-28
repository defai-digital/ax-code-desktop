# Documentation index

Start with the [repository README](../README.md) for installation, supported platforms and a development quick start.
Use the [contributing guide](../desktop/CONTRIBUTING.md) for setup and the checks every change must pass.

## Using the app

| Document                                                    | Purpose                                                            |
| ----------------------------------------------------------- | ------------------------------------------------------------------ |
| [Repository README](../README.md)                           | Install, update, platforms, verifying downloads                    |
| [Desktop workspace](../desktop/README.md)                   | Feature tour, process model and package overview                   |
| [WebMCP page tools](webmcp-page-tools.md)                   | Let the agent use your web app from the project browser            |
| [Custom themes](../desktop/docs/CUSTOM_THEMES.md)           | Write and load your own theme JSON                                 |
| [Changelog](../desktop/CHANGELOG.md)                        | Release history                                                    |
| [User docs source](../desktop/packages/docs/README.md)      | MDX source for the public documentation site                       |

## Contributing

| Document                                                  | Purpose                                                                     |
| --------------------------------------------------------- | --------------------------------------------------------------------------- |
| [Contributing](../desktop/CONTRIBUTING.md)                | Prerequisites, running the app, submission checks, code style               |
| [Repository layout](repository-layout.md)                 | Directory responsibilities, tooling placement, test and dependency ownership |
| [UI verification with WebMCP](development-webmcp.md)      | Verify renderer changes with fresh state, DOM and screenshots               |
| [Web runtime](../desktop/packages/web/README.md)          | Standalone web runtime CLI for development and diagnostics                  |
| [Docs authoring guide](../desktop/packages/docs/CONTRIBUTING.md) | Voice, style and structure for user documentation pages              |
| [AX Wiki](ax-wiki.md)                                     | How agents should use the generated repository wiki                         |

## Architecture

| Document                                                                  | Purpose                                                  |
| ------------------------------------------------------------------------- | -------------------------------------------------------- |
| [Project boundaries](../desktop/docs/PROJECT_BOUNDARIES.md)               | UI, web server, Electron and runtime ownership; import rules |
| [AX Code integration](../desktop/docs/AX_CODE_INTEGRATION.md)             | Runtime supervision, resolution order, SDK and version pins |
| [SDK update checklist](../desktop/docs/AX_CODE_REVENDOR_CHECKLIST.md)     | What to re-verify when the SDK or runtime pin changes     |

## Security and releases

| Document                                                            | Purpose                                                 |
| ------------------------------------------------------------------- | ------------------------------------------------------- |
| [Security policy](../desktop/SECURITY.md)                           | Scope, supported versions and vulnerability reporting   |
| [Desktop security hardening](../desktop/docs/desktop-security-hardening.md) | Renderer isolation, navigation, CSP, IPC and Keychain behavior |
| [Release publishing](../desktop/docs/GITHUB_RELEASE_PUBLISHING.md)  | Release ownership and qualification workflow            |
| [Minisign](../desktop/docs/MINISIGN.md)                             | Artifact verification and signing operations            |
| [Distribution operations](../.internal/deploy/README.md)            | Qualified release staging and upload commands           |
| [WinGet manifests](../tools/winget/README.md)                       | Generate Windows Package Manager manifests              |

## User documentation source

[desktop/packages/docs](../desktop/packages/docs/README.md) holds the English MDX pages and sidebar for the downstream
documentation website. It is content, not a pnpm workspace package.

Run `pnpm run docs:validate` from the repository root to check MDX frontmatter, sidebar routes and supported-platform
policy. CI runs it for every change, including documentation-only changes. It validates source only; it does not
render or publish the website.

## Historical context

[Reverse proxy setup](../desktop/docs/REVERSE_PROXY.md) is retained as historical design context. Current builds are
local-only, so its deployment examples do not describe a supported installation.

Product records under `.internal/prd`, `.internal/adr`, `.internal/spec` and `.internal/reports` stay local and are
intentionally not published. Generated `.ax-wiki` pages are navigation aids; verify their claims against tracked source
and config.
