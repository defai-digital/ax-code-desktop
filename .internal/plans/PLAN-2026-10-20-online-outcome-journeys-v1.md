# Online-informed outcome journey plan

Status: Proposed, 2026-10-20. Implements the
[PRD addendum](../prd/PRD-2026-10-20-online-outcome-journeys-v1.md) through existing ownership and qualification gates.

## Sequence

1. Research checkpoint: inspect official Chrome, OpenChamber, Orca, Herdr and OpenCode documentation. Record links,
   observation date, documented behavior and AX design inference separately. Completed in the
   [research report](../reports/RESEARCH-2026-10-20-online-outcome-journeys.md); this qualifies documentation only.
2. Map OJ-01/02/03/08 to existing native harness journeys and failure receipts. Extend coverage where a concrete gap is
   reproducible. Use the existing isolated profile/runtime; preserve real user data. Before application edits, record the
   specific reproduction, scope and expected regression in the relevant repair plan.
3. Resolve the saved-recap producer semantics and write the bounded technical spec under the existing reference-informed
   plan. Implement return/read/resume before considering automatic generation. Test offline reads and late responses.
4. Inspect canonical scheduler source and published contracts for overlap, admission, cancellation and missed occurrences.
   Write a policy/contract matrix listing supported, missing and uncertain facts. New ownership or contract changes follow
   accepted PRD, paired ADR and technical-spec requirements before implementation.
5. Extend the three-project/six-task test with overlapping due times, manual run, pause/cancel, transport ambiguity,
   unavailable history and restart/DST cases. Check producer facts independently of UI labels. First qualify fixtures;
   qualify a live provider/MCP journey separately within existing authorization. Missing permissions or limits remain
   explicit; do not raise budgets or weaken the scenario silently.
6. Inspect populated layouts and keyboard behavior, then run the applicable focused tests, typecheck, build and native
   regressions. Record exact build/backend and unresolved limitations. Make scoped local commits; no push or publication.
7. Run matched user tasks against the current AX baseline. Measure orientation, intervention/review effort, accepted
   results, provider cost and reopened defects before choosing positioning claims or increasing task volume.

## Completion boundary

The online research/addendum checkpoint is complete when sources, proposed requirements and sequencing are reviewable.
It does not complete recap implementation, concurrent scheduling qualification, packaged browser qualification or the
active WebMCP bug-finding goal. Preserve accepted records and all unrelated working-tree changes.
