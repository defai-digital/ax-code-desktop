# Governance document lifecycle review

Date: 2026-10-18
Authorization: the user requested cleanup of unfitted or expired PRDs and ADRs during the UI/UX implementation.

## Decisions

- Move the explicitly completed naming PRD to `prd/complete/`.
- Move the two release-preparation PRDs to `prd/archive/` as historical preparation records. Their release-freeze and private-source assumptions have later, explicit, limited supersessions. This is not a claim that every native release gate has passed. Their distribution, identity, signing and continuity clauses remain reference requirements.
- Archive the stale producer ADR proposal. Read-only inspection of `../ax-code/.internal/adr/ADR-184-desktop-native-webmcp-provider.md` verified the accepted paired decision. No sibling repository was modified. ADR-198 also records the later page-interaction contract; it does not replace the provider ownership boundary.
- Retain accepted ADRs in place. ADR-006 is partially superseded by ADR-008 for ordering; ADR-009 (release preparation) and ADR-010 are partially superseded by ADR-012 for freezes; ADR-010's private-source qualification assumption is superseded by ADR-011. Remaining clauses still govern the product, so deleting or declaring those whole ADRs obsolete would be incorrect.
- Retain ADR-005 and ADR-007 as deferred. Renderer supervision does not prove delivery of a durable portfolio service or AX Agent integration.
- Retain the extraction umbrella PRD, browser contracts and supervision workspace PRD. Historical problem descriptions are historical context, not current implementation inventories.
- Index both ADR-009 records by full filename and qualified title. Do not renumber accepted decisions and invalidate existing references.
- Keep the version-specific public-cutover PRD as historical acceptance context in the index; current authority is ADR-012 plus the release policy. This cleanup neither re-authorizes a new version nor certifies public distribution.

## Preservation receipts

Original locations now contain navigation stubs. Existing inbound links continue to resolve; archived originals retain their exact bytes. Accepted ADR bodies were not edited.

| Original | Preserved record | SHA-256 |
| --- | --- | --- |
| `prd/PRD-2026-10-15-product-name-ax-code.md` | `prd/complete/PRD-2026-10-15-product-name-ax-code.md` | `bc5770b4a12d6fc57ef30b69988d99e16d134b43d1f141f5ea4f64cd5864a1d5` |
| `prd/PRD-2026-10-11-independent-desktop-release-preparation.md` | `prd/archive/PRD-2026-10-11-independent-desktop-release-preparation.md` | `d2b2c8affa3d4130a750a24d07026aac580800464c4627379fdaed6b877a7a9b` |
| `prd/PRD-2026-10-11-desktop-distribution-v1.md` | `prd/archive/PRD-2026-10-11-desktop-distribution-v1.md` | `249c88e8b84933e5342ceb5ab364904ae8f214fb270b3be1bbcbeb1b41a05621` |
| `adr/proposals/AX-CODE-ADR-PROPOSAL-2026-10-11-embedded-webmcp-transport-v1.md` | `adr/archive/AX-CODE-ADR-PROPOSAL-2026-10-11-embedded-webmcp-transport-v1.md` | `13a89dfc7676bb9c0b41d7311e632463582567ecd3ad2e0e633eec3e1d8b2047` |

## Verification

All PRD/ADR index targets and archive stub targets must exist. Hashes above must match the preserved files and their pre-change Git contents. The active indexes distinguish accepted, historical, completed and deferred records. Publication, signing and live release state were not requalified in this documentation review.
