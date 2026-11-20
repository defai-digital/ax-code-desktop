import type { EvidenceSeal } from "@/lib/supervision/evidenceSeal"
import type { MissionPullRequest } from "@/lib/supervision/pullRequestCache"
import type { VerificationEvidence } from "@/lib/supervision/verificationEvidence"

export type RequestFixKind = "stale" | "failed" | "pr-failed" | "general"

/**
 * What the request is about. Stale outranks failed: a failure on a commit that is no longer HEAD says nothing about
 * this tree, so the first thing to ask for is a fresh run.
 */
export function requestFixKind(
  checks: VerificationEvidence | null,
  seal: EvidenceSeal,
  pullRequest?: MissionPullRequest | null,
): RequestFixKind {
  // Both of these quote the commit the checks ran on. Without one (mixed commits, or a result the runtime did not
  // attribute) there is nothing true to quote, so the request is left to the person.
  if (seal.checked && seal.state === "stale") return "stale"
  if (seal.checked && checks?.state === "failed" && !checks.stale) return "failed"
  // Local evidence comes first: it is about this tree. A pull request's checks are about what was pushed, and only
  // an open one whose status was read recently is worth quoting.
  if (pullRequestChecksFailed(pullRequest)) return "pr-failed"
  return "general"
}

/** Failed checks on a pull request that is still open and whose status is fresh. */
export function pullRequestChecksFailed(pullRequest: MissionPullRequest | null | undefined): boolean {
  if (!pullRequest || pullRequest.stale) return false
  return pullRequest.checks === "failed" && (pullRequest.state === "open" || pullRequest.state === "draft")
}
