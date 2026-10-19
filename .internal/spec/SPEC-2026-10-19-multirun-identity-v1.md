# Multi-run identity v1

Status: Accepted for implementation on 2026-10-19.
PRD: PRD-2026-10-19-supervision-v3 (requirement 3).

## 1. Runtime contract (unchanged)

The runtime validates `metadata.multiRun` with `SessionMetadata.MultiRun` (AX Code `src/session/metadata.ts`):
`{ groupId: ID, variantId: ID, model?: ID, agent?: ID, worktree?: string }`, strict. The published SDK 2.6.37 accepts
`metadata` on `session.update` and returns `metadata` on sessions. No runtime or SDK change.

## 2. Writing

- `useMultiRunStore.createMultiRun` generates one random launch ID (`mr_<32 hex>`). Each run group of the launch gets its
  own `groupId` (the launch ID for a single group, `<launchId>_gN` when the launch has several groups, so groups with
  different prompts stay separately comparable), and each lane a `variantId` (`<groupId>.<lane index>`).
  After each lane session is created, it calls the SDK session update with
  `metadata: { ...existing, multiRun: { groupId, variantId, model, agent, worktree } }`, omitting unknown optional fields.
- A failed metadata update does not fail the launch. The lane still groups by title; the failure is logged once per
  launch.
- IDs match the runtime's `ID` rule (1 to 160 characters, no character-set limit); `worktree` is at most 4,096
  characters. Optional fields over a limit are omitted.
- The runtime replaces the whole `metadata` object on session update (it does not merge namespaces), so the write uses
  the created session's `metadata` as the base and sets only `multiRun`.

## 3. Reading

- New pure module `ui/src/lib/multirun/identity.ts`: `readMultiRunIdentity(session)` returns the validated
  `{ groupId, variantId, model?, agent?, worktree? }` or `null` for missing or malformed metadata (never throws).
- `lib/supervision/multiRunGroups.ts` keys a lane by `multiRun.groupId` when present, otherwise by the existing parsed
  title key. Labels prefer `model` from metadata, then the parsed title.
- Fusion sessions remain excluded from lanes as today.

## 4. Tests

Metadata-first grouping, title fallback for legacy sessions, mixed groups, renamed lane stays grouped, two launches with
the same name stay separate, malformed metadata ignored, launch writes metadata, metadata failure does not fail launch.
