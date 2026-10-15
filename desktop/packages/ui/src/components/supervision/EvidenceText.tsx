import React from "react"

import { useI18n } from "@/lib/i18n"
import type { SupervisionEvidence } from "@/lib/supervision/sessionState"

/**
 * Locale-aware formatter for diff evidence. Returns null when there is no
 * evidence to show, so callers decide how to render the empty case.
 */
// eslint-disable-next-line react-refresh/only-export-components -- Hook is tightly coupled with EvidenceText
export function useFormatEvidence(): (evidence: SupervisionEvidence | null | undefined) => string | null {
  const { t } = useI18n()
  return React.useCallback(
    (evidence: SupervisionEvidence | null | undefined): string | null => {
      if (!evidence) return null
      const { additions, deletions, files } = evidence
      if (additions === 0 && deletions === 0 && files === 0) return null
      return t("supervision.evidence.summary", { additions, deletions, files })
    },
    [t],
  )
}

export interface EvidenceTextProps {
  evidence: SupervisionEvidence | null | undefined
  /** What to render when there is no evidence: an em dash (default) or nothing. */
  fallback?: "dash" | "none"
  className?: string
}

export const EvidenceText: React.FC<EvidenceTextProps> = ({ evidence, fallback = "dash", className }) => {
  const formatEvidence = useFormatEvidence()
  const text = formatEvidence(evidence)
  if (text === null) {
    if (fallback === "none") return null
    return <span className={className}>{"\u2014"}</span>
  }
  return <span className={className}>{text}</span>
}
