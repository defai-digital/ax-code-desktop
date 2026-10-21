# WebMCP excellence: plus, minus, multiply, divide (read-only, English, max 1000 words). Do not modify files.

Controlling record: .internal/prd/PRD-2026-10-21-webmcp-excellence-v1.md (target: every persona step at 9/10 or better).
Read first: .internal/reviews/webmcp-excellence-2026-10-21/AUDIT-2026-10-21-codex-baseline.md (baseline scores with source
citations) and RESEARCH-2026-10-21-state-of-the-art.md (spec status, Chrome DevTools WebMCP pane, browser-agent UX, pain points,
15 candidate criteria). Verify claims in source (desktop/packages/ui/src, desktop/packages/electron/src) before relying on them.

Baseline (codex): Supervisor A1 discover 7, A4 approvals 7, A2 trust 6, A5 failures 6, A6 evidence 6, A7 pause/take over 6,
A3 watch live 5, A8 several sessions 3. Builder B2 try and compare 4, B3 iterate 4, B1 see registered tools 3, B4 diagnose misuse 3,
B5 onboarding docs 2.

Rethink the improvement using four operations:
- PLUS: add a high-value capability.
- MINUS: remove something that hurts (confusing copy, duplicated controls, noise, wrong defaults, dead ends).
- MULTIPLY: decompose something tangled into logical parts (e.g. one overloaded panel or state).
- DIVIDE: group scattered things to simplify (one place for what is spread across surfaces).

For each proposal give: operation; the persona step(s) it raises and by how much; what exactly changes (path:line where it
applies); Desktop-only or needs the AX Code runtime; effort S/M/L; and an acceptance test a native journey or unit test can check.
Constraints: Desktop owns no second coding runtime; no standing grants or auto-approval without AX Trust policy; page content,
tool arguments and results are untrusted; no credentials stored; macOS, Windows and Ubuntu; 14 locales; accessibility.
End with your top 8, ordered by score gain per effort, and one sentence on what would make a user call this experience excellent.
