/**
 * Stable multi-run identity stored in the runtime's `metadata.multiRun` session namespace
 * (SPEC-2026-10-19-multirun-identity-v1). The runtime validates the namespace with
 * `SessionMetadata.MultiRun`: `groupId` and `variantId` are required strings of 1 to 160
 * characters, `model` and `agent` are optional strings with the same limits, and `worktree` is an
 * optional path of 1 to 4096 characters. This module mirrors those limits on read and write so
 * Desktop never sends a value the runtime rejects and never trusts one it would not have accepted.
 */

export const MULTI_RUN_METADATA_NAMESPACE = "multiRun"

/** Runtime `ID` rule: `z.string().min(1).max(160)`. */
export const MULTI_RUN_ID_MAX_LENGTH = 160
/** Runtime `MAX_PATH_LENGTH`. */
export const MULTI_RUN_WORKTREE_MAX_LENGTH = 4096

export type MultiRunIdentity = {
  groupId: string
  variantId: string
  model?: string
  agent?: string
  worktree?: string
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const isBoundedString = (value: unknown, max: number): value is string =>
  typeof value === "string" && value.length >= 1 && value.length <= max

/** True when `value` satisfies the runtime `ID` rule. */
export const isMultiRunId = (value: unknown): value is string => isBoundedString(value, MULTI_RUN_ID_MAX_LENGTH)

/**
 * Validated multi-run identity of a session, or null when the session has no `metadata.multiRun`
 * or it is malformed. Unknown extra keys are ignored. Never throws.
 */
export function readMultiRunIdentity(session: unknown): MultiRunIdentity | null {
  try {
    if (!isRecord(session)) return null
    const metadata = session.metadata
    if (!isRecord(metadata)) return null
    const value = metadata[MULTI_RUN_METADATA_NAMESPACE]
    if (!isRecord(value)) return null

    const { groupId, variantId, model, agent, worktree } = value
    if (!isMultiRunId(groupId) || !isMultiRunId(variantId)) return null
    if (model !== undefined && !isMultiRunId(model)) return null
    if (agent !== undefined && !isMultiRunId(agent)) return null
    if (worktree !== undefined && !isBoundedString(worktree, MULTI_RUN_WORKTREE_MAX_LENGTH)) return null

    const identity: MultiRunIdentity = { groupId, variantId }
    if (model !== undefined) identity.model = model
    if (agent !== undefined) identity.agent = agent
    if (worktree !== undefined) identity.worktree = worktree
    return identity
  } catch {
    // A hostile getter or proxy must not break supervision rendering.
    return null
  }
}

/**
 * Build the identity to write for one lane. Optional fields that are unknown or would violate the
 * runtime limits are omitted rather than sent. Returns null when the required IDs are invalid.
 */
export function buildMultiRunIdentity(input: {
  groupId: string
  variantId: string
  model?: string | null
  agent?: string | null
  worktree?: string | null
}): MultiRunIdentity | null {
  if (!isMultiRunId(input.groupId) || !isMultiRunId(input.variantId)) return null
  const identity: MultiRunIdentity = { groupId: input.groupId, variantId: input.variantId }
  if (isMultiRunId(input.model)) identity.model = input.model
  if (isMultiRunId(input.agent)) identity.agent = input.agent
  if (isBoundedString(input.worktree, MULTI_RUN_WORKTREE_MAX_LENGTH)) identity.worktree = input.worktree
  return identity
}

/**
 * Session metadata to send with the session update. The runtime replaces `metadata` as a whole on
 * update, so every other namespace and key already on the session is carried over unchanged.
 */
export function withMultiRunIdentity(existing: unknown, identity: MultiRunIdentity): Record<string, unknown> {
  const base = isRecord(existing) ? existing : {}
  return { ...base, [MULTI_RUN_METADATA_NAMESPACE]: identity }
}

const randomToken = (): string => {
  const cryptoApi = (globalThis as { crypto?: Crypto }).crypto
  if (cryptoApi && typeof cryptoApi.randomUUID === "function") {
    return cryptoApi.randomUUID().replace(/-/g, "")
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`
}

/** A new random multi-run group ID, well within the runtime `ID` rule. */
export function createMultiRunGroupId(): string {
  return `mr_${randomToken()}`
}
