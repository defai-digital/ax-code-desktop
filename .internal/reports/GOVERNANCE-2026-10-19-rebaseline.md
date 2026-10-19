# Governance re-baseline after 7.27.3

Date: 2026-10-19
Authorization: the user asked to adjust PRDs and ADRs that are outdated, unfitted or contradictory, then to plan,
implement, test and commit the competitive-quality improvements (PRD-2026-10-19-competitive-quality-v1, Phase 0).
Evidence: `../reviews/competitive-gap-2026-10-19/` (multi-reviewer gap review and the two governance audits).

## Rules applied

Same as the 2026-10-18 lifecycle review: accepted ADR, PRD and spec bodies are not edited. Indexes record current
interpretation and supersession scope. New decisions are new records.

## Corrections

| Record                                 | Problem                                                                                                                                                                  | Action                                                                                                                       |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md`                            | Described a planned product, Phase 3 in progress, pending shadow/upgrade/rollback evidence and unavailable release commands, although 7.27.3 shipped with those receipts | Rewritten to the ADR-012 channel; each release still needs its own qualification. Names the active plan and the new commands |
| `spec/README.md`                       | Missing nine specs, statuses from before 7.27.3, "AX Coder" title                                                                                                        | Rebuilt with active, deferred and historical sections and a current-interpretation column                                    |
| `adr/README.md`                        | ADR-016 and ADR-017 outside the table; no entry for the new ADR-018; ADR-005 standing unclear next to shipped supervision                                                | Folded into the table; ADR-018 added; ADR-005 note added                                                                     |
| `prd/README.md`                        | Missing streamlit-run v3 and usability v2; analysis v4/v5 as loose bullets; usability v1 still "authorized"                                                              | Rebuilt rows; usability v1 marked implemented; v3/v4 superseded; usability v2 item 5 superseded                              |
| `electron-builder.yml` publish comment | Said publishing stays disabled until "ADR-009" gates pass (ambiguous number, stale state)                                                                                | Points to ADR-012 and per-release qualification                                                                              |
| Electron 45 candidate spec             | Pins `45.0.0-beta.1`; the product ships 44.9.0                                                                                                                           | Indexed as historical qualification experiment                                                                               |

## New records

- PRD-2026-10-19-competitive-quality-v1 (active plan).
- ADR-018 renderer security baseline, with SPEC-2026-10-19-renderer-security-baseline-v1.
- SPEC-2026-10-19-desktop-e2e-harness-v1.

## Known gaps recorded, not changed here

- Desktop runs `git worktree add` in `web/server/lib/git/service.js` although the runtime owns worktree execution (ADR-002).
  Phase 2 item 8 of the PRD needs a paired AX Code ADR for a stable worktree API first.
- User-selected UI and code fonts load from `cdn.jsdelivr.net` (`ui/src/lib/fontLoader.ts`), which `font-src` blocks in
  every mode, so that setting has no effect today. Fixing it needs a product decision (bundle fonts or allow a font host).
- Runtime-repository records were audited read-only. Findings for `../ax-code` (missing ADR-031/035 cited by
  `renderer-contract.ts`, duplicate ADR-211/212, ADR-047 D3 and ADR-104 blocking TUI tabs, stale "AX Coder" text) are in
  the evidence folder. That repository already has an in-progress audit backup dated 2026-10-19
  (`.internal/backup/adr-prd-pre-audit-2026-10-19/`), so no runtime record was edited from this session.

## Verification

Every index target exists. Accepted bodies are byte-identical to `HEAD`; only indexes, `AGENTS.md`, new records and this
report changed. Release state was read from `config/desktop-release-policy.json` and
`reports/RELEASE-2026-10-19-v7.27.3-publication.md`; nothing was requalified or republished.
