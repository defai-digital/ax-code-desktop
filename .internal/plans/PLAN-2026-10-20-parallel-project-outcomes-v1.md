# Parallel project outcomes implementation plan v1

Status: Proposed, with cross-repository implementation authorized by the user on 2026-10-20.
[PRD](../prd/PRD-2026-10-20-parallel-project-outcomes-v1.md).

## 1. Establish producer and consumer contracts

Inventory both Git states, Desktop's installed SDK and pinned runtime, and AX Code's queue, scheduler, recap,
MCP/WebMCP and server routes. Read applicable subsystem ADRs before edits. Record local source differences
from the pinned artifact. Preserve unrelated changes in both repositories.

Trace project/session/run identity through request, admission, events, cancellation, output and recap.
Separate missing Desktop wiring from missing SDK exposure and missing runtime functionality.
Review existing `session.recap` and `lastRecap` before designing additional summary generation.

## 2. Reproduce parallel behavior

Build stateful Desktop fixtures and actual runtime tests with temporary projects and a deterministic local provider.
Implement the PRD matrix starting with two projects, then six scheduled tasks across three projects.
Use barriers to prove execution overlaps rather than relying on timing sleeps or simultaneous running labels.
Inject blocked approvals, failures, cancellation, delayed/out-of-order events and disconnects independently.
Verify MCP/browser context isolation using controlled local servers/pages and existing authorization.

Collect native WebMCP action receipts, independent DOM/screenshots, producer run records and request counts.
Measure interactive responsiveness under the six-task burst before the twenty-task characterization.
Keep simulated UI and actual runtime results explicitly separate.

## 3. Repair at the owning layer

Fix Desktop projection/control defects in Desktop. Fix queue, scheduler, cancellation or MCP execution defects
in AX Code. Extend generated SDK contracts only when needed for an actual consumer requirement.
For new locked behavior or ownership changes, write paired ADR/spec records before implementation.
Do not duplicate scheduler state or bypass permission checks to make a fixture pass.

Use existing public endpoints for cancellation and completion observation; never forge internal lifecycle transitions
as evidence of actual execution. Preserve failure receipts and add regressions for each reproduced defect.

## 4. Validate the paired candidate

Run focused core runtime tests and typecheck for producer changes. Server/OpenAPI changes require SDK generation,
generated API drift review and SDK tests. Run Desktop focused tests, full UI tests when project actions change,
typecheck, lint, build and native WebMCP journeys. Retest the concurrency matrix after fixes.

A local development SDK/runtime candidate may validate compatibility but must be identified as local-only.
Desktop CI and release continue to consume exact published SDK versions and pinned signed runtime artifacts;
no permanent sibling links or unqualified pin changes. Publication remains a separate authorized release step.

## 5. Record and commit

Record each scenario as passed, failed or unrun with artifact paths, versions, limitations and measured capacity.
Commit scoped producer and consumer changes separately with cross-repository SHAs. AX Code's `.internal/`
records remain local under its repository policy; do not force-add them. Preserve unrelated user changes.
This plan expands the earlier scheduling plan's scope to permit necessary SDK/runtime/MCP implementation;
it does not authorize automatic recurring jobs, push or publication.
