# Task: how does AX Code Desktop close the gap to Orca and win?

READ-ONLY ANALYSIS. Do not create, edit, move or delete any file anywhere. Do not run git commands that change state.
Print your answer to stdout only. Work for as long as you need to read code, then answer in English, at most 1,400 words.

## Repositories
- Ours: /Users/akiralam/code/ax-code-desktop (AX Code Desktop; source under desktop/packages/{ui,electron,web}; read AGENTS.md first).
- Target: /Users/akiralam/code/ax-code-desktop/.internal/reference/orca (Orca, stablyai/orca, v1.4.214, MIT; src/main, src/renderer, src/preload, mobile/, native/, docs/).
- Prior work you must read before answering (it was written today; do not redo it, challenge it):
  - .internal/reviews/competitive-gap-2026-10-19/PROPOSAL.md
  - .internal/prd/PRD-2026-10-19-competitive-quality-v1.md and PRD-2026-10-19-supervision-v3.md
  - .internal/reference/README.md

## What we know
- Two scorings put Orca first. The 8-criterion static review (today): Orca 88, AX Code Desktop 76.5 (breadth 9, supervision 8, UX 8,
  architecture 6, testing 7, release 7, performance 7, security 8). A second 6-dimension score gave Orca 8.6 and AX 7.6: our
  security and release are at or above Orca, but we trail on capability breadth, reach (mobile, remote, web) and maturity/test volume.
- Orca is an agent-neutral terminal host: it runs any CLI agent (Claude Code, Codex, Grok, ...) in PTYs, one git worktree per agent,
  with its own browser/design mode, GitHub/Linear/GitLab tasks, SSH worktrees, mobile companion app (iOS/Android), automations,
  account switching and usage tracking, computer use, an `orca` CLI, ~7 locales, ~95 CI workflows, ~1,100 e2e files. It ships daily.
  Its docs/audits folder lists dozens of resource-retention bug audits.
- AX Code Desktop is the supervision UI for ONE runtime (the AX Code runtime, a separate repo, ../ax-code) that owns coding tools, goal
  contracts, verification and worktree execution. We have Mission Control, Needs You queue, pop-out window, multi-run lanes, scheduled
  task families, project registry, 14 locales, signed + notarized releases with install/upgrade/rollback receipts, renderer sandbox + CSP
  baseline, typed IPC contract, an e2e harness (7 files), seeded model tests for sync state machines.

## Hard constraints (from AGENTS.md; do not propose violating them)
- Never fork or duplicate the AX Code or AX Agent runtime. Desktop must not own a second coding runtime, coding tools, or worktree execution.
- AX Trust owns credentials/policy; AX Telemetry owns observability; no raw credentials in Desktop records.
- Settled: no Rust migration, no event shedding, no open-paragraph DOM change. No Windows arm64. No Effect dependency.
- PRD -> ADR -> SPEC -> implementation order for any product-boundary change. pnpm only, frozen lockfile.
- Previous review's "do not copy" list: Orca in-desktop orchestration/per-vendor adapters/VM+relay estate, e2e volume as a target,
  worktree as the only unit, SSH manager/tunnels, pets/particles, 63 machine-generated locales.

## Questions (answer each, with file-path evidence from BOTH trees)
1. Ground truth. Read Orca's code, not its README. Which of its marketed capabilities are genuinely deep, which are shallow, and where is
   it weak (reliability, security, architecture, complexity, testing quality vs volume)? Name at least 5 concrete weaknesses with paths.
2. Gap table. For the 12 largest functional gaps between Orca and AX Code Desktop, give: gap, Orca evidence path, our current state path,
   and a class: (A) Desktop-only, buildable now; (B) needs a runtime/SDK change first; (C) blocked by a boundary rule; (D) not worth copying.
3. Where can we WIN, not just match? Define 3 to 5 axes where AX Code Desktop can be measurably better than Orca without breaking the
   boundaries (think: verified/trustworthy supervision, goal-contract progress, governed approvals, signed update + rollback evidence,
   accessibility, localization quality, stability/leak-free long sessions, performance budgets, ...). For each axis give a concrete,
   falsifiable metric we can publish and the current Orca number or evidence.
4. Sequenced plan. Propose at most 10 work packages ordered by (score gain per effort), each with: scope, owner repo, gate record needed
   (PRD/ADR/SPEC), effort (S/M/L), measurable exit criterion, and which scoring criterion it moves. Say which 3 you would start this week.
5. Mobile/remote. Orca's mobile companion is its most visible reach advantage. Within our boundaries (read-only supervision first, AX Trust
   owns auth), what is the smallest credible version, what does it need from the runtime, and is it worth doing before the other items?
6. Honest odds. Can AX Code Desktop overtake Orca's overall score within 90 days? Give a probability and the single biggest blocker.
   If you think "beat Orca at being Orca" is the wrong goal, say what the right goal is.
7. Disagreements. Which parts of the prior PROPOSAL.md or the two PRDs do you think are wrong, missing, or mis-prioritized?

Be concrete and skeptical. Prefer a short list of well-evidenced claims over a long list of guesses. Mark any claim you did not verify in code as UNVERIFIED.
