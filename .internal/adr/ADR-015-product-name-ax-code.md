# ADR-015: Product Name Is AX Code

Status: Accepted; user approved on 2026-10-15.
Date: 2026-10-15.
Related: PRD-2026-10-15-product-name-ax-code; ADR-002; ADR-006.

## Context

Earlier records call this repository and product "AX Coder". The user decided on 2026-10-15 that the
name "AX Coder" will not be used. The shipped compatibility identity in `config/desktop-identity.json`
already uses the product name "AX Code".

## Decision

1. The product is **AX Code**. The desktop app and this repository are **AX Code Desktop**. New text,
   user-visible strings, tooling messages and commit messages use these names.
2. "AX Coder" in earlier accepted PRDs, ADRs, specs, reviews and reports means AX Code Desktop. Those
   records are not rewritten; this ADR is their terminology note.
3. Living guidance (`AGENTS.md`, directory READMEs) and human-readable script and workflow messages use
   AX Code Desktop.
4. Machine identifiers stay: the root package name `ax-coder`, the `setup-ax-coder-toolchain` action path
   and schema ids such as `ax-coder.desktop-identity.v1`. Renaming them needs a separate approved change
   that updates every reference and the release contract.

## Consequences

Bundle id, updater repository, artifact names, user-data paths and the signed release identity do not
change. Contract tests that assert tooling messages are updated with those messages.

## Rollback

Revert the wording commit. No identifier, data or release behavior depends on it.
