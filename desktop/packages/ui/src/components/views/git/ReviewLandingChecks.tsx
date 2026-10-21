import React from "react"
import { ChecksChip } from "@/components/supervision/missionControl/MissionControlChecks"
import { useSupervisionVerificationDemand, verificationEvidenceCache } from "@/hooks/useSupervisionVerification"
import { useI18n } from "@/lib/i18n"
import { verificationEvidenceFor } from "@/lib/supervision/verificationEvidenceCache"
import { useSession } from "@/sync/sync-context"

/** Uses the same runtime envelopes and bounded cache as Mission Control, never transcript text. */
export function ReviewLandingChecks({
  directory,
  sessionId,
  warn,
}: {
  directory: string
  sessionId: string
  warn: boolean
}) {
  const { t } = useI18n()
  const session = useSession(sessionId, directory)
  const revision = session?.time.updated
  const demand = React.useMemo(
    () => (revision === undefined ? [] : [{ sessionId, directory, updatedAt: revision }]),
    [sessionId, directory, revision],
  )
  useSupervisionVerificationDemand(demand)
  const entries = React.useSyncExternalStore(
    verificationEvidenceCache.subscribe,
    verificationEvidenceCache.getSnapshot,
    verificationEvidenceCache.getSnapshot,
  )
  const checks = verificationEvidenceFor(sessionId, directory, entries)
  if (!checks) return null
  return (
    <div className="flex flex-wrap items-center gap-2" data-landing-checks>
      <ChecksChip checks={checks} />
      <span className="typography-meta">
        {t(`supervision.missionControl.checks.state.${checks.state}`)}
        {checks.stale ? ` · ${t("supervision.missionControl.checks.stale")}` : ""}
      </span>
      {warn && (checks.state === "failed" || checks.stale) ? (
        <p role="status" className="typography-meta text-[var(--status-warning)]">
          {t("diffView.landing.checksWarning")}
        </p>
      ) : null}
    </div>
  )
}
