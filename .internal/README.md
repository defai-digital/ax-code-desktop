# AX Code Desktop internal records

This directory contains product-development requirements, decisions and evidence for AX Code Desktop.

- [PRDs](prd/README.md): active, deferred, completed and historical requirements
- [ADRs](adr/README.md): authoritative decisions and scoped supersession relationships
- [Specifications](spec/README.md): locked technical contracts
- [Reports](reports/README.md): investigations, implementation plans and verification evidence

Public user and operator documentation belongs in `docs/` after the corresponding behavior ships.

History extraction, the independent workspace and local source ownership cutover are complete. The accepted
[extraction umbrella](prd/PRD-2026-09-02-ax-coder-product-and-desktop-extraction.md) retains broader requirements;
current release authorization and qualification conditions are governed by ADR-012. Source implementation is not
proof of signed native installation, upgrade, rollback or live gateway activation.

The [2026-10-18 lifecycle review](reports/GOVERNANCE-2026-10-18-document-lifecycle.md) archives stale preparation
records and the completed naming PRD, preserves accepted decision text, and records which older clauses still apply.
