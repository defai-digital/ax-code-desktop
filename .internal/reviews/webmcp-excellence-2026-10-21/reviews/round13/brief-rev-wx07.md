# Review WX-07 (read-only, English). Findings by severity with path:line, or "no blocking issue". Do not modify files.
The change is the last commit on this worktree's branch (`git show HEAD`): the project browser's agent call strip
(desktop/packages/ui/src/components/mcp/WebMcpCallStrip.tsx, lib/webMcpCalls.ts, stores/useWebMcpBrowserStore.ts generation,
components/layout/EmbeddedWebMcpBrowser.tsx) shows each call's duration and a short credential-filtered result without the
runtime's untrusted envelope, marks calls made on an earlier page generation, and opens the call in the conversation through the
existing pending message navigation. Check: credential leakage in the result preview (strings, nested objects, long values),
untrusted page text rendering, correctness of the earlier-page marker across sessions and reloads, keyboard and screen-reader
behavior of the row buttons, re-render cost during streaming, and that opening a call works when the session's messages are not
loaded yet.
