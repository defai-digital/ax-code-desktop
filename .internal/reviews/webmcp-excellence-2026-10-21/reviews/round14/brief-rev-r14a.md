# Review round 14a: sessions you can see and control (read-only, English). Findings by severity with path:line, or "no blocking issue".
# Do not modify files.
The change is `git diff HEAD` plus new files in the current directory (worktree branch r14-sessions); claims in R14A-HANDOFF.md
(ignore its "English strings" section: the strings were since moved into the normal dictionary and translated, and the
locale loader is unchanged). Requirements: .internal/prd/PRD-2026-10-21-webmcp-excellence-v1.md WX-15 design items 3 to 6, WX-09,
task W7. Check: the page switcher and revoke act only on the chosen session (never the shown one by mistake, including equal
session IDs in different projects); LRU unload picks only hidden idle pages, never one with a held or active call, keeps the
address in memory only and reloads with access off; the trust summary grants nothing and states nothing false; waiting
surfaced in Needs you, Mission Control and the session grid points at the right page and is not double counted; listeners and
memory stay bounded (W7 50 switches); keyboard and screen-reader behavior; Windows/macOS/Linux.
