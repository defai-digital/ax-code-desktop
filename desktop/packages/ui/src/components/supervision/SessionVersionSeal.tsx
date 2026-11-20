import { useEvidenceSeal, useSessionVerification } from "@/hooks/useEvidenceSeal"

import { VersionSeal } from "./VersionSeal"

interface SessionVersionSealProps {
  sessionId: string
  directory: string
  className?: string
}

/** The version seal for one session's verification result; renders nothing when there is no bound result. */
export function SessionVersionSeal(props: SessionVersionSealProps) {
  const { sessionId, directory, className } = props
  const checks = useSessionVerification(sessionId, directory)
  const seal = useEvidenceSeal(checks, directory)
  return <VersionSeal seal={seal} className={className} />
}
