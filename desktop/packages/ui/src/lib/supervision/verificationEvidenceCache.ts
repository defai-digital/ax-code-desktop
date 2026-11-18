import {
  createSessionReadCache,
  type SessionReadEntry,
  type SessionReadOptions,
  type SessionReadTarget,
} from "./sessionReadCache"
import { normalizeVerificationEvidence, type VerificationEvidence } from "./verificationEvidence"

export type VerificationEvidenceTarget = SessionReadTarget

type VerificationPayload = { checks: VerificationEvidence | null }
type VerificationEvidenceEntry = SessionReadEntry<VerificationPayload>

export type FetchSessionRisk = (input: {
  sessionID: string
  directory: string
  signal: AbortSignal
}) => Promise<{ data?: unknown; error?: unknown }>

/** Bounded, directory-scoped cache of normalized verification counts. */
export function createVerificationEvidenceCache(fetchRisk: FetchSessionRisk, options: SessionReadOptions = {}) {
  const { getSnapshot, subscribe, mount } = createSessionReadCache<
    VerificationEvidenceTarget,
    unknown,
    VerificationPayload
  >(
    {
      request: fetchRisk,
      project: (data) => ({ checks: normalizeVerificationEvidence(data) }),
      empty: { checks: null },
    },
    options,
  )
  return { getSnapshot, subscribe, mount }
}

/** The aggregate for this session and directory, or null when that read is not in the cache. */
export function verificationEvidenceFor(
  sessionId: string,
  directory: string | null,
  entries: ReadonlyMap<string, VerificationEvidenceEntry>,
): VerificationEvidence | null {
  const entry = entries.get(sessionId)
  if (!entry || entry.directory !== directory || !entry.checks) return null
  return entry.stale ? { ...entry.checks, stale: true } : entry.checks
}
