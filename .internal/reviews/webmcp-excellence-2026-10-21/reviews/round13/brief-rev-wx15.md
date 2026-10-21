# Review WX-15 steps 1-6 (read-only, English). Findings by severity with path:line, or "no blocking issue". Do not modify files.
The change is `git diff HEAD` in the current directory (worktree branch wx15-view-pool). Task and claims: WX15-HANDOFF.md;
design: .internal/prd/PRD-2026-10-21-webmcp-excellence-v1.md "WX-15 design". It turns the project browser into a pool of views
keyed by project and session (desktop/packages/electron/src/desktop-webmcp-browser.js), adds list/show IPC, a hidden-view wait
gate, per-session revocation, per-project storage partitions, enrollment ownership validation via GET /session/{id}, and a keyed
renderer store (desktop/packages/ui/src/stores/useWebMcpBrowserStore.ts, lib/webMcpViewKey.ts, components/layout/EmbeddedWebMcpBrowser.tsx).
Check especially: can any request reach the wrong view, session or project; can a hidden page act; storage isolation between
projects and cleanup; leaks (listeners, timers, views, sessions) on window close, renderer crash and repeated switching;
race conditions in serialized create/clear/show; IPC contract compatibility; renderer store correctness (stale writes across
keys, no store importing a store); Windows/macOS/Linux differences (bounds, minimize, DPI); and whether the handoff's claims
match the code.
