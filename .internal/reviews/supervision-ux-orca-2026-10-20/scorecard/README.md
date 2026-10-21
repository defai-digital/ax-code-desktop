# Competitor UX scorecard, round 2 (2026-10-20)

Persona: a developer supervising 5-20 parallel coding-agent sessions. Weights: overview 40%, review 35%, workspace 25%.
Evidence given to every judge: `competitor-facts.md` (docs/source facts, V = verified, I = inference), `matrix2.md` (capability
matrix with AX source citations, written by codex before the activity preview merged) and the native WebMCP journey script.
Unknown competitor capabilities do not count as competitor weaknesses.

| Judge | AX | Orca | Claude Code | Codex app | opencode | AX vs Orca | AX vs opencode |
| --- | --- | --- | --- | --- | --- | --- | --- |
| codex | 7.40 | 8.80 | 8.43 | 7.95 | 6.58 | worse | better |
| deepseek-flash | 7.75 | 8.65 | 6.60 | 7.35 | 7.25 | worse | better |
| MiniMax-M3 | invalid | | | | | | |

MiniMax could not read the evidence files (scratch path denied) and scored competitors from memory; its result is kept only for
the record and not counted.

Result: AX Code Desktop is judged better than opencode desktop and still behind Orca for this persona. Gaps both valid judges
named: compound filters and child-agent rows on the overview, two sessions side by side / pane splitting in the workspace, and in
review a selectable base or branch scope, anchored and resolvable comments with a target picker, and viewed marks bound to the full
diff identity for git scopes. The activity preview was ungated (all densities, beside goal/error lines) after this round, as both
judges recommended. Round 3 targets the remaining feasible gaps and is re-judged.

## Round 3 (2026-10-20)

Targets from the two valid round-2 judges: compound overview filters and child agents, a base/branch review scope, two sessions
side by side, a comment target, and the activity preview ungated.

- Mission Control: Projects multi-select facet (counts follow the other active filters), Has changes facet, removable chips with
  Clear all (focus returns to the filter bar), "+N agent(s)" with a child list in Details, activity preview in every density.
- Review: Branch scope against the merge-base of a selectable base branch (Desktop web server, base validated against existing
  branches, file and size caps), read-only rail and diff. Comments can be sent to another live session of the same project
  (worktrees included) using that session's own agent and model; the choice resets for another review's drafts.
- Workspace: "Open this session in a separate window" from the navigation bar and the command palette, so two sessions can be
  watched side by side.
- Reviews: deepseek-flash reviewed each package written by another model (A3 by codex, C3 by Claude, and a security review of
  B3 by grok before commit); confirmed findings
  were fixed (stale comment target, worktree project matching, per-target model, window-open failure toast, facet count base,
  chip focus, menu label, child-count plural). The B3 security review found no injection or path escape; its two availability
  findings were fixed before commit (16 MiB response budget, 30 s git timeouts). The raw review texts of this round were lost when the session scratch directory was
  cleared; findings and fixes are listed here and in the commit.
- Gates: UI 4016, web 1482 (+2 skipped), Electron 761 (+1 skipped) tests; typecheck, lint, boundaries, 14 locales; native WebMCP
  supervision-workspace, portfolio-identity and project-home journeys passed (project-home timed out once at load average ~30 and
  passed on rerun).
