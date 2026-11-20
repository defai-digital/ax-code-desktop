import React from "react"

import { useSupervisionVerificationDemand, verificationEvidenceCache } from "@/hooks/useSupervisionVerification"
import { sealEvidence, type EvidenceSeal } from "@/lib/supervision/evidenceSeal"
import type { VerificationEvidence } from "@/lib/supervision/verificationEvidence"
import { verificationEvidenceFor } from "@/lib/supervision/verificationEvidenceCache"
import { useGitStore } from "@/stores/useGitStore"
import { useSession } from "@/sync/sync-context"

/** Bind a verification result to the Git status already loaded for its directory. Reads nothing by itself. */
export function useEvidenceSeal(
  checks: VerificationEvidence | null | undefined,
  directory: string | null | undefined,
): EvidenceSeal {
  // Two primitives, not the status object: a row must not re-render on every status poll that leaves them unchanged.
  const headOid = useGitStore((state) => (directory ? state.directories.get(directory)?.status?.headOid : undefined))
  const isClean = useGitStore((state) => (directory ? state.directories.get(directory)?.status?.isClean : undefined))
  return React.useMemo(
    () => sealEvidence(checks, isClean === undefined ? null : { headOid, isClean }),
    [checks, headOid, isClean],
  )
}

/**
 * One session's verification result from the same runtime envelopes and bounded cache as Mission Control. The read
 * is keyed on the session revision, so it refreshes when the session moves and is dropped with the last consumer.
 */
export function useSessionVerification(sessionId: string | null, directory: string | null): VerificationEvidence | null {
  const session = useSession(sessionId, directory ?? undefined)
  const revision = sessionId && directory ? session?.time.updated : undefined
  const demand = React.useMemo(
    () => (sessionId && directory && revision !== undefined ? [{ sessionId, directory, updatedAt: revision }] : []),
    [sessionId, directory, revision],
  )
  useSupervisionVerificationDemand(demand)
  const entries = React.useSyncExternalStore(
    verificationEvidenceCache.subscribe,
    verificationEvidenceCache.getSnapshot,
    verificationEvidenceCache.getSnapshot,
  )
  return sessionId ? verificationEvidenceFor(sessionId, directory, entries) : null
}
