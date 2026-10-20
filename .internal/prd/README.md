# AX Code Desktop PRD index

Reviewed 2026-10-19 (`../reports/GOVERNANCE-2026-10-19-rebaseline.md`). Status below distinguishes active requirements from historical implementation descriptions. Accepted records retain their original wording; later decisions control only their stated superseded clauses.

## Active and deferred requirements

Scheduling addendum proposal: [Scheduled outcomes v1](PRD-2026-10-20-scheduled-outcomes-v1.md), with
[a focused review](../reports/SCHEDULED-TASKS-2026-10-20-review.md) and
[implementation plan](../plans/PLAN-2026-10-20-scheduled-outcomes-v1.md). This adds recurring outcomes to the WebMCP/recap
proposal; no new scheduler or automatic recurring spend is authorized.

Product-direction proposal: [WebMCP outcomes and project recap v1](PRD-2026-10-20-webmcp-outcomes-and-recap-v1.md), with
[a phased plan](../plans/PLAN-2026-10-20-webmcp-outcomes-and-recap-v1.md). New recap/workflow requirements are proposed;
the earlier authorized Settings/WebMCP repair slice remains in progress. Accepted records below are not superseded.

| PRD | Current interpretation |
| --- | --- |
| [Product and Desktop extraction](PRD-2026-09-02-ax-coder-product-and-desktop-extraction.md) | Accepted umbrella; source extraction and local cutover complete; broader portfolio and qualification requirements remain independently tracked |
| [Embedded native WebMCP v1](PRD-2026-10-11-embedded-native-webmcp-v1.md) | Accepted provider contract; extended by browser routing and page interaction |
| [Public signed qualification](PRD-2026-10-12-public-signed-shadow.md) | Accepted qualification requirements; do not infer live receipts from source implementation |
| [Browser entrypoint routing](PRD-2026-10-13-browser-entrypoint-routing.md) | Accepted separation of CLI Chrome and Desktop embedded browser paths |
| [Agent page interaction](PRD-2026-10-15-agent-page-interaction.md) | Accepted read/act/wait scope; paired producer ADR-198 exists |
| [Supervision workspace](PRD-2026-10-15-supervision-workspace.md) | Accepted requirements; board, requests, inspector and comparison exist in source; refined by usability v1 |
| [Supervision usability v1](PRD-2026-10-18-supervision-usability-v1.md) | Implemented; the five UI/UX findings shipped |
| [Analysis routing v5](PRD-2026-10-18-analysis-routing-v5.md) | Accepted and implemented; supersedes the dedicated Streamlit product path in v3 and v4 |
| [Competitive quality v1](PRD-2026-10-19-competitive-quality-v1.md) | Active plan. Phases 0 and 1 implemented; Phase 2 in progress (items 9, 11, 12, 14 recorded; 8 waits for AX Code) |
| [Supervision v3](PRD-2026-10-19-supervision-v3.md) | Accepted; pop-out window and multi-run identity |
| [Trusted supervision v1](PRD-2026-10-19-trusted-supervision-v1.md) | Accepted; Phase A (runtime goal on supervision rows, web-document script hashes, trust scorecard) authorized; Phases B and C are requirements only |

## Completed and historical records

| PRD | Disposition |
| --- | --- |
| [Local source cutover](complete/PRD-2026-09-02-local-desktop-source-cutover.md) | Completed source-ownership record; its historical public-release freeze is not current publication authority |
| [Product naming](complete/PRD-2026-10-15-product-name-ax-code.md) | Completed; ADR-015 governs naming |
| [Independent release preparation](archive/PRD-2026-10-11-independent-desktop-release-preparation.md) | Historical preparation; release freeze superseded by ADR-012 only |
| [Distribution preparation](archive/PRD-2026-10-11-desktop-distribution-v1.md) | Historical private-source/freeze assumptions; see ADR-011 and ADR-012; distribution invariants survive |
| [Public release cutover](PRD-2026-10-12-public-desktop-release-cutover.md) | Historical 7.24.5 candidate requirements; ADR-012 and exact-candidate qualification govern subsequent releases |
| [Analysis app handoff v4](PRD-2026-10-18-analysis-app-handoff-v4.md) | Product path superseded by analysis routing v5 |
| [Streamlit project run v3](PRD-2026-10-18-streamlit-project-run-v3.md) | Superseded by analysis routing v5; dedicated Streamlit execution removed |
| [Supervision usability v2 (Streamlit preview)](PRD-2026-10-18-supervision-usability-v2-streamlit-preview.md) | Items 1 to 4 stand; item 5 (dedicated Streamlit recipe) is superseded by analysis routing v5 |

See the [lifecycle review](../reports/GOVERNANCE-2026-10-18-document-lifecycle.md) for archive hashes, supersession scope, and intentionally retained deferred decisions.
