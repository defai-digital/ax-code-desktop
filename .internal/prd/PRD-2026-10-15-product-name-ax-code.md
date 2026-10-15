# Product Name: AX Code, Not AX Coder

Status: Proposed. Awaiting user approval; nothing below is implemented yet.

Date: 2026-10-15

## Problem

The user decided on 2026-10-15 that the product is **AX Code** and that the name "AX Coder" will not be
used. The desktop app is **AX Code Desktop** (`config/desktop-identity.json` already ships `productName`
"AX Code"). User-visible strings, the install guide and contributor docs were corrected in `4a95e920`.

"AX Coder" still appears 420 times in 225 files, almost all in governance and evidence records:

| Area | Occurrences | Files | Nature |
| --- | --- | --- | --- |
| `.internal/reviews` | 167 | 166 | Historical review transcripts |
| `.internal/prd` | 86 | 6 | Accepted and completed PRDs |
| `.internal/adr` | 65 | 12 | Accepted ADRs |
| `.internal/reports` | 42 | 14 | Phase and release evidence |
| `.internal/spec` | 27 | 12 | Locked technical specs |
| `.github` | 11 | 3 | Workflow names, the `setup-ax-coder-toolchain` action |
| `script` | 9 | 6 | Check messages and contract tests |
| `AGENTS.md`, `.internal/README.md`, `.internal/reference`, `tools`, `.internal/experiments` | 13 | 6 | Living guidance and notes |

Repository rules forbid silently rewriting accepted PRDs, ADRs and specs, and evidence records must stay
as recorded.

## Proposal

1. **Decision record.** Add an ADR, "Product name is AX Code", stating that "AX Coder" in earlier records
   means the AX Code Desktop repository and product, and that new text uses AX Code / AX Code Desktop.
   Accepted PRDs, ADRs and specs are not rewritten; the ADR is their terminology note.
2. **Living guidance.** Update `AGENTS.md`, `.internal/README.md`, `.internal/reference/README.md`,
   `tools/winget/README.md` and the experiment note to say AX Code Desktop.
3. **Tooling messages.** Update human-readable messages in `script/` and workflow display names in
   `.github/` after checking which strings are asserted by contract tests
   (`script/workflow-contract.test.mjs`, `script/source-ownership-contract.test.mjs`,
   `script/release-policy.test.mjs`), changing the assertions in the same commit.
4. **Identifiers stay unless they are only names.** The root package name `ax-coder`, the
   `setup-ax-coder-toolchain` action path and any schema id such as `ax-coder.desktop-identity.v1` are
   machine identifiers referenced by CI and release evidence. Keep them in this change; rename them only in
   a separate, explicitly approved change that also updates every reference and the release contract.
5. **Evidence untouched.** `.internal/reviews`, `.internal/reports` and completed PRDs keep their wording.

## Out of scope

Bundle id, updater repository, artifact names, user-data paths and the signed release identity; none use
"AX Coder" today and none change.

## Acceptance

- `git grep "AX Coder"` outside evidence records, accepted decision records and the identifiers in item 4
  returns nothing.
- Typecheck, lint, tests and `pnpm run check:boundaries` pass.
- The `.github` workflow edits are coordinated with the in-progress CI work in the main checkout, which
  currently has uncommitted changes to those workflow files.
