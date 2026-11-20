import type { EvidenceSeal } from "@/lib/supervision/evidenceSeal"
import type { VerificationEvidence } from "@/lib/supervision/verificationEvidence"

export type RequestFixKind = "stale" | "failed" | "general"

/**
 * What the request is about. Stale outranks failed: a failure on a commit that is no longer HEAD says nothing about
 * this tree, so the first thing to ask for is a fresh run.
 */
export function requestFixKind(checks: VerificationEvidence | null, seal: EvidenceSeal): RequestFixKind {
  if (seal.state === "stale") return "stale"
  if (checks?.state === "failed" && !checks.stale) return "failed"
  return "general"
}
