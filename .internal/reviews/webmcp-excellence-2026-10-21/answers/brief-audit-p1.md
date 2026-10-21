# Fresh WebMCP audit for P1 problems (read-only, English, max 900 words). Do not modify files.
AX Code Desktop's project browser lets coding agents use web pages through WebMCP page tools. Controlling record:
.internal/prd/PRD-2026-10-21-webmcp-excellence-v1.md (definition of done item 3: "no P1 finding in an audit run after the last
round"). Audit the current source (desktop/packages/electron/src/desktop-webmcp-browser.js, native-webmcp.js,
webmcp-manual-outcome.js; desktop/packages/ui/src components/layout/EmbeddedWebMcpBrowser.tsx, components/mcp/*,
components/chat/PermissionCard.tsx, components/views/git/ReviewLandingBrowserEvidence.tsx, lib/toolHelpers.ts,
lib/webMcpCalls.ts, stores/useWebMcpBrowserStore.ts; docs/webmcp-page-tools.md; desktop/packages/electron/scripts/webmcp-check*).
P1 means: a person can lose work or data, the agent can act on the wrong page/session/project or without approval, a credential
can leak to the screen/logs/storage, the UI states something false about what happened (e.g. success that failed, a rollback that
did not happen), the app hangs or a pane becomes unusable with no recovery, or a documented flow does not work.
List each P1 with path:line, a concrete reproduction and the user impact; then P2s briefly. Say "no P1" if none. Ignore
uncommitted files under config/, pnpm-lock.yaml and package.json version pins (another session's runtime update).
