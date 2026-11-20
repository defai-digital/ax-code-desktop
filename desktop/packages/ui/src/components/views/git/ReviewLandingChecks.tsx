import { ChecksChip } from "@/components/supervision/missionControl/MissionControlChecks"
import { VersionSeal } from "@/components/supervision/VersionSeal"
import { useEvidenceSeal, useSessionVerification } from "@/hooks/useEvidenceSeal"
import { useI18n } from "@/lib/i18n"
import { sealBlocksApproval } from "@/lib/supervision/evidenceSeal"

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
  const checks = useSessionVerification(sessionId, directory)
  const seal = useEvidenceSeal(checks, directory)
  if (!checks) return null
  // A result about a tree that no longer exists is not evidence for this commit or push, whatever it counted.
  const outdated = sealBlocksApproval(seal)
  return (
    <div className="flex flex-wrap items-center gap-2" data-landing-checks>
      <ChecksChip checks={checks} outdated={outdated} />
      <VersionSeal seal={seal} />
      <span className="typography-meta">
        {t(`supervision.missionControl.checks.state.${checks.state}`)}
        {checks.stale ? ` · ${t("supervision.missionControl.checks.stale")}` : ""}
      </span>
      {warn && outdated ? (
        <p role="status" data-landing-evidence-outdated className="typography-meta text-foreground">
          {t("supervision.seal.staleWarning")}
        </p>
      ) : warn && (checks.state === "failed" || checks.stale) ? (
        <p role="status" className="typography-meta text-[var(--status-warning)]">
          {t("diffView.landing.checksWarning")}
        </p>
      ) : null}
    </div>
  )
}
