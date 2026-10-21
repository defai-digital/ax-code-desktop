import React from "react"

import { axCodeClient } from "@/lib/ax-code/client"
import {
  createVerificationEvidenceCache,
  type VerificationEvidenceTarget,
} from "@/lib/supervision/verificationEvidenceCache"

export const verificationEvidenceCache = createVerificationEvidenceCache((input) =>
  axCodeClient.getScopedSdkClient(input.directory).session.risk(
    { sessionID: input.sessionID, directory: input.directory, envelopes: true },
    { signal: input.signal },
  ),
)

/**
 * Mount on Mission Control and pass the rows already in scope. Sessions outside
 * that scope are not read. The publisher copies cached aggregates onto rows.
 */
export function useSupervisionVerificationDemand(
  rows: readonly VerificationEvidenceTarget[],
  cache = verificationEvidenceCache,
): void {
  const consumer = React.useRef<ReturnType<typeof cache.mount> | null>(null)
  React.useEffect(() => {
    const mounted = cache.mount()
    consumer.current = mounted
    return () => {
      consumer.current = null
      mounted.dispose()
    }
  }, [cache])
  React.useEffect(() => {
    consumer.current?.update(rows)
  }, [cache, rows])
}
