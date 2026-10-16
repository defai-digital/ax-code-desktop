import type { GitHubIssueComment, GitHubPullRequestReviewComment } from "@/lib/api/types"

export type BoardKind = "issues" | "pulls"
export type IssueStateFilter = "open" | "closed"
export type PullStateFilter = "open" | "closed" | "merged"

export type IssueBoardFilters = {
  kind: "issues"
  state: IssueStateFilter
  label: string
  query: string
  page: number
}

export type PullBoardFilters = {
  kind: "pulls"
  state: PullStateFilter
  query: string
  page: number
}

export type BoardFilters = IssueBoardFilters | PullBoardFilters

export type BoardListOptions = {
  page: number
  state: IssueStateFilter | PullStateFilter
  label?: string
  q?: string
}

const HEX_COLOR = /^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/

export function defaultBoardFilters(kind: BoardKind): BoardFilters {
  if (kind === "pulls") return { kind, state: "open", query: "", page: 1 }
  return { kind: "issues", state: "open", label: "", query: "", page: 1 }
}

/** Query the board sends to the existing list endpoints. Empty label and text are omitted. */
export function buildBoardListOptions(filters: IssueBoardFilters): BoardListOptions & { state: IssueStateFilter }
export function buildBoardListOptions(filters: PullBoardFilters): BoardListOptions & { state: PullStateFilter }
export function buildBoardListOptions(filters: BoardFilters): BoardListOptions
export function buildBoardListOptions(filters: BoardFilters): BoardListOptions {
  const page = Number.isFinite(filters.page) && filters.page > 0 ? Math.floor(filters.page) : 1
  const query = filters.query.trim()
  if (filters.kind === "issues") {
    const label = filters.label.trim()
    return {
      page,
      state: filters.state === "closed" ? "closed" : "open",
      ...(label ? { label } : {}),
      ...(query ? { q: query } : {}),
    }
  }
  const state: PullStateFilter =
    filters.state === "closed" || filters.state === "merged" ? filters.state : "open"
  return {
    page,
    state,
    ...(query ? { q: query } : {}),
  }
}

export function boardItemKey(item: {
  number: number
  sourceRepo?: { owner: string; repo: string } | null
}): string {
  const owner = item.sourceRepo?.owner ?? ""
  const repo = item.sourceRepo?.repo ?? ""
  return `${owner}/${repo}#${item.number}`
}

/**
 * GitHub label colors are hex without a hash. Light fills get dark text.
 * Anything that is not a 3 or 6 digit hex is left to the caller.
 */
export function labelChipStyle(color: string | undefined | null): { backgroundColor: string; color: string } | null {
  if (!color) return null
  const raw = color.trim().replace(/^#/, "")
  if (!HEX_COLOR.test(raw)) return null
  const hex = raw.length === 3 ? raw.split("").map((part) => part + part).join("") : raw
  const red = Number.parseInt(hex.slice(0, 2), 16)
  const green = Number.parseInt(hex.slice(2, 4), 16)
  const blue = Number.parseInt(hex.slice(4, 6), 16)
  const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255
  return {
    backgroundColor: `#${hex}`,
    color: luminance > 0.62 ? "#1c1917" : "#fafaf9",
  }
}

export function visibleLabels<T>(labels: readonly T[] | undefined, max = 4): { shown: T[]; extra: number } {
  const list = labels ? [...labels] : []
  const cap = Number.isFinite(max) && max > 0 ? Math.floor(max) : 4
  if (list.length <= cap) return { shown: list, extra: 0 }
  return { shown: list.slice(0, cap), extra: list.length - cap }
}

export type BoardComment = {
  id: string
  body: string
  url?: string
  createdAt?: string
  authorLogin?: string
}

export function boardComments(input: {
  issueComments?: GitHubIssueComment[] | null
  reviewComments?: GitHubPullRequestReviewComment[] | null
}): BoardComment[] {
  const comments: BoardComment[] = []
  for (const comment of input.issueComments ?? []) {
    comments.push({
      id: `issue:${comment.id}`,
      body: comment.body,
      url: comment.url,
      createdAt: comment.createdAt,
      authorLogin: comment.author?.login,
    })
  }
  for (const comment of input.reviewComments ?? []) {
    comments.push({
      id: `review:${comment.id}`,
      body: comment.body,
      url: comment.url,
      createdAt: comment.createdAt,
      authorLogin: comment.author?.login,
    })
  }
  comments.sort((left, right) => (Date.parse(left.createdAt ?? "") || 0) - (Date.parse(right.createdAt ?? "") || 0))
  return comments
}
