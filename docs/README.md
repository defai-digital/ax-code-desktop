# Documentation index

Start with the [repository README](../README.md) for installation, supported platforms and development commands.
Use [Contributing](../desktop/CONTRIBUTING.md) for setup and submission checks.

## Development and architecture

| Document                                                                  | Purpose                                                                         |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| [Repository layout](repository-layout.md)                                 | Directory responsibilities, tooling ownership and incremental refactoring rules |
| [Desktop workspace](../desktop/README.md)                                 | Package overview and desktop behavior                                           |
| [Project boundaries](../desktop/docs/PROJECT_BOUNDARIES.md)               | UI, web server, Electron and runtime ownership                                  |
| [AX Code integration](../desktop/docs/AX_CODE_INTEGRATION.md)             | SDK and runtime integration                                                     |
| [Runtime update checklist](../desktop/docs/AX_CODE_REVENDOR_CHECKLIST.md) | Updating the pinned runtime                                                     |
| [UI verification](development-webmcp.md)                                  | Verify development UI changes with fresh state and DOM evidence                 |
| [Page tools](webmcp-page-tools.md)                                        | WebMCP page-tool contracts                                                      |
| [AX Wiki](ax-wiki.md)                                                     | Generated wiki routing, ownership and freshness                                 |
| [Custom themes](../desktop/docs/CUSTOM_THEMES.md)                         | Theme development                                                               |

## Security and releases

| Document                                                            | Purpose                                                 |
| ------------------------------------------------------------------- | ------------------------------------------------------- |
| [Security policy](../desktop/SECURITY.md)                           | Supported security boundary and vulnerability reporting |
| [Renderer hardening](../desktop/docs/desktop-security-hardening.md) | Desktop security design                                 |
| [Release publishing](../desktop/docs/GITHUB_RELEASE_PUBLISHING.md)  | Current release ownership and qualification workflow    |
| [Minisign](../desktop/docs/MINISIGN.md)                             | Artifact verification and signing operations            |
| [Distribution operations](../.internal/deploy/README.md)            | Qualified release staging and upload commands           |

## User documentation source

[desktop/packages/docs](../desktop/packages/docs/README.md) contains the English MDX source and sidebar for the
downstream documentation website. It is content, not a pnpm workspace package. Its
[authoring guide](../desktop/packages/docs/CONTRIBUTING.md) describes the content handoff.

Run `pnpm run docs:validate` from the repository root to check MDX frontmatter, sidebar routes and supported-platform
policy. CI runs the same validator for every change, including documentation-only changes. This validates source;
it does not render or publish the website.

## Historical context

[Reverse proxy setup](../desktop/docs/REVERSE_PROXY.md) is retained as historical design context. Current builds are
local-only, so its deployment examples do not describe a supported installation.

Local product records under `.internal/prd`, `.internal/adr`, `.internal/spec` and `.internal/reports` are intentionally
not published. Generated `.ax-wiki` pages are navigation aids; verify their claims against tracked source and config.
