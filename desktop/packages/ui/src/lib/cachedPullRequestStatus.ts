import type { GitHubChecksSummary, GitHubPullRequest, GitHubPullRequestStatus, GitHubRepoRef } from "./api/types"
import { isPlainRecord } from "./record"
import { shallowRecordEqual } from "./shallowRecordEqual"

const optionalString = (value: unknown): boolean => value === undefined || typeof value === "string"
const nullableString = (value: unknown): boolean => value == null || typeof value === "string"
const optionalBoolean = (value: unknown): boolean => value === undefined || typeof value === "boolean"
const finiteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value)
const isRepo = (value: unknown): value is GitHubRepoRef =>
  isPlainRecord(value) &&
  typeof value.owner === "string" &&
  typeof value.repo === "string" &&
  typeof value.url === "string"
const isPr = (value: unknown): value is GitHubPullRequest =>
  isPlainRecord(value) &&
  finiteNumber(value.number) &&
  typeof value.title === "string" &&
  typeof value.url === "string" &&
  (value.state === "open" || value.state === "closed" || value.state === "merged") &&
  typeof value.draft === "boolean" &&
  typeof value.base === "string" &&
  typeof value.head === "string" &&
  optionalString(value.body) &&
  optionalString(value.headSha) &&
  (value.mergeable == null || typeof value.mergeable === "boolean") &&
  nullableString(value.mergeableState)
const isChecks = (value: unknown): value is GitHubChecksSummary =>
  isPlainRecord(value) &&
  (value.state === "success" || value.state === "failure" || value.state === "pending" || value.state === "unknown") &&
  [value.total, value.success, value.failure, value.pending].every((count) => finiteNumber(count) && count >= 0)

/** Cached server data may be stale, but malformed data must never become a renderer snapshot. */
export const restoreCachedPullRequestStatus = (value: unknown): GitHubPullRequestStatus | null => {
  if (!isPlainRecord(value) || typeof value.connected !== "boolean") return null
  if (value.repo != null && !isRepo(value.repo)) return null
  if (value.pr != null && !isPr(value.pr)) return null
  if (value.checks != null && !isChecks(value.checks)) return null
  if (
    !optionalString(value.branch) ||
    !optionalBoolean(value.canMerge) ||
    !nullableString(value.defaultBranch) ||
    !nullableString(value.resolvedRemoteName)
  )
    return null
  return value as GitHubPullRequestStatus
}


/** An omitted body can be carried only for the same pull request. */
export function carryPullRequestBody(
  previous: GitHubPullRequestStatus | null,
  next: GitHubPullRequestStatus,
): GitHubPullRequestStatus {
  const before = previous?.pr
  const after = next.pr
  if (!before || !after || before.number !== after.number || before.url !== after.url || after.body?.trim()) return next
  if (!before.body?.trim()) return next
  return { ...next, pr: { ...after, body: before.body } }
}


/** Body hydration can race a status read without superseding the status itself. */
export function hasPullRequestStatusChanged(
  before: GitHubPullRequestStatus | null | undefined,
  after: GitHubPullRequestStatus | null,
): boolean {
  if (before === after) return false
  if (!before || !after) return true
  if (!shallowRecordEqual({ ...before, pr: undefined }, { ...after, pr: undefined })) return true
  if (before.pr === after.pr) return false
  if (!before.pr || !after.pr) return true
  return !shallowRecordEqual({ ...before.pr, body: undefined }, { ...after.pr, body: undefined })
}
