import type { VerificationEvidence } from "./verificationEvidence"

/**
 * Whether a verification result is still about the commit on disk.
 *
 * The runtime fingerprints the file contents a check ran on, and Desktop does not recompute that fingerprint. So
 * Desktop can prove one thing only: whether the checks ran on the commit that is at HEAD now. It never says
 * "verified".
 *
 * - `current`: every check ran on the commit at HEAD and there are no uncommitted changes now.
 * - `stale`: the checks ran on a commit that is no longer at HEAD. Stale is not a failure: nothing is known to be
 *   wrong, the receipt has expired.
 * - `unverified`: the result cannot be tied to this tree.
 */
export type EvidenceSealState = "current" | "stale" | "unverified"

export type EvidenceSealReason =
  /** Ran on the commit at HEAD; nothing uncommitted now. */
  | "same-commit"
  /** HEAD is a different commit from the one the checks ran on. */
  | "moved"
  /** The checks ran on different commits. */
  | "mixed"
  /** Ran on the commit at HEAD, but there are uncommitted changes now that the checks may not cover. */
  | "dirty"
  /** The runtime did not say which commit the checks ran on. */
  | "unattributed"
  /** HEAD is not known for this directory. */
  | "no-head"
  /** The latest read failed; the counts are from an older read. */
  | "unread"
  /** No checks were recorded. */
  | "none"

export interface EvidenceSeal {
  state: EvidenceSealState
  reason: EvidenceSealReason
  /** Short commit at HEAD, when known. */
  head: string | null
  /** Short commit the checks ran on, when the runtime attributed one. */
  checked: string | null
}

export interface SealHead {
  /** Commit at HEAD; null for an unborn branch, undefined when the status provider does not report it. */
  headOid?: string | null
  isClean: boolean
}

const SHORT = 7

export function shortCommit(commit: string | null | undefined): string | null {
  return commit ? commit.slice(0, SHORT) : null
}

/**
 * Bind a verification result to the commit on disk. The verdict (passed or failed) is not part of the seal: the
 * counts beside it carry that. The seal only says which commit the counts are about.
 */
export function sealEvidence(
  checks: VerificationEvidence | null | undefined,
  head: SealHead | null | undefined,
): EvidenceSeal {
  const headShort = shortCommit(head?.headOid)
  if (!checks || checks.state === "none") {
    return { state: "unverified", reason: "none", head: headShort, checked: null }
  }
  const source = checks.source
  if (source === undefined) return { state: "unverified", reason: "unattributed", head: headShort, checked: null }
  if (source === "mixed") return { state: "stale", reason: "mixed", head: headShort, checked: null }
  const checked = shortCommit(source.commit)
  if (!head || !head.headOid) return { state: "unverified", reason: "no-head", head: null, checked }
  // A moved HEAD is known from the older result too, so it outranks a failed refresh.
  if (head.headOid !== source.commit) return { state: "stale", reason: "moved", head: headShort, checked }
  if (checks.stale) return { state: "unverified", reason: "unread", head: headShort, checked }
  if (!head.isClean) return { state: "unverified", reason: "dirty", head: headShort, checked }
  return { state: "current", reason: "same-commit", head: headShort, checked }
}

/** A result that must not be acted on as if it described this tree. */
export function sealBlocksApproval(seal: EvidenceSeal): boolean {
  return seal.state === "stale"
}
