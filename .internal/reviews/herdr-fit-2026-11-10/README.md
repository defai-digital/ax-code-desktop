# Herdr collaboration fit consultation

Date: 2026-11-10. [Final assessment and proposed direction](../../reports/REVIEW-2026-11-10-herdr-collaboration-fit.md).
This package records advisory review, source evidence and bounded behavior probes. It is not architecture approval,
live bridge qualification, a user study or competitor execution.

## Three rounds with the requested CLIs

| Round | Shared input | Claude Code Opus 5.5 | Grok CLI 4.7 | Muse CLI Wonder 1.0 |
| --- | --- | --- | --- | --- |
| Independent | [input](review-input.md) | [review](independent-claude.md), [receipt](independent-claude.receipt.json) | [review](independent-grok.md), [receipt](independent-grok.receipt.json) | [review](independent-muse.md), [receipt](independent-muse.receipt.json) |
| Cross-challenge | [input](challenge-input.md) | [review](challenge-claude.md), [receipt](challenge-claude.receipt.json) | [review](challenge-grok.md), [receipt](challenge-grok.receipt.json) | [review](challenge-muse.md), [receipt](challenge-muse.receipt.json) |
| CLI bridge correction | [input](final-input.md) | [review](final-claude.md), [receipt](final-claude.receipt.json) | [review](final-grok.md), [receipt](final-grok.receipt.json) | [review](final-muse.md), [receipt](final-muse.receipt.json) |

All nine exited successfully and produced substantive responses. Requested models were `claude-opus-5-5`, `grok-4.7`
and `muse-wonder-1.0`. Native usage receipts report the same Claude/Muse IDs, and `grok-4.7-build` for Grok. This is
transport-reported identity, not an independent attestation of model weights. No fallback model was configured.

The first packet missed existing CLI provider integration, and initial reviewer conclusions consequently overstated
absence. The final round corrects that with SDK, Desktop and pinned-runtime evidence. Keep the rounds together; earlier
outputs alone do not represent the final recommendation. The coordinator's disposition is in the assessment.

[Runner](run-reviewers.py) disables tools/delegation for consultation and writes raw transport only under
`/tmp/ax-desktop-herdr-fit-20261110`. [Extraction](extract-results.py) retains final answers and selected model usage,
excluding raw reasoning and account/transport metadata. These successful direct-CLI calls do not qualify AX's existing
CLI bridge or its default native-tool permissions.

## Sources and checks

- [Source manifest](source-manifest.json): current Desktop/installed SDK and runtime tag `v7.30.16`, rather than newer HEAD.
- Existing focused baseline: 8 files / 67 tests passed. Command: `pnpm --dir desktop/packages/ui run test` followed by
  `src/stores/useMultiRunStore.test.ts`, `src/components/multirun/MultiRunFusionDialog.test.tsx`,
  `src/lib/supervision/multiRunGroups.test.ts`, `src/lib/supervision/childSessions.test.ts`,
  `src/lib/supervision/sessionState.test.ts`, `src/hooks/useSupervisionRows.children.test.tsx`,
  `src/lib/supervision/verificationEvidence.test.ts`, `src/lib/workMode.test.ts`.
  The invocation also named a nonexistent `WorkModeSelector.test.tsx`; it contributed no tests and is not included in the count.
- [Provider/routing check](provider-routing-tests.receipt.json), [log](provider-routing-tests.log): 3 files / 54 passed;
  concurrent AgentTeam changes were present, so this is working-tree evidence, not an exact clean-HEAD gate.
- [Fusion probe](run-fusion-probe.py), [receipt](fusion-probe.receipt.json), [log](fusion-probe.log): seven existing fixtures
  pass and two mounted identity expectations fail as predicted. Another same-slug launch is included (3 instead of 2),
  and a renamed metadata-backed representative yields no sources (0 instead of 2).
  The temporary test is removed in `finally`; no product/test fixture changes are retained.

All checks are fixture/mocked behavior, not native visual, live-provider concurrency, process-isolation or permission
qualification. No production code was changed to repair the findings during this research.
