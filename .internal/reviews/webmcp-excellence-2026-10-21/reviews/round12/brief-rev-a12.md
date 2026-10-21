# Accessibility and correctness review of A12 (read-only, English). Do not modify files.
Uncommitted change in this repository (git diff of desktop/packages/ui/src/components/chat/PermissionCard.tsx, lib/toolHelpers.ts
and components/layout/EmbeddedWebMcpBrowser.tsx): (1) the WebMCP approval card opens with one effect sentence built only from call
data (webMcpEffect) and states that the answer covers this call only; (2) the browser mode tabs move focus with Arrow/Home/End;
(3) the native page area is a labelled region. Check WAI-ARIA tabs pattern correctness, screen-reader announcement of the effect
sentence and the region, that the effect sentence can never be steered by page-supplied text, and edge cases (missing metadata,
unknown operations, long element names, 14 locales). Findings by severity with path:line, or "no blocking issue".
