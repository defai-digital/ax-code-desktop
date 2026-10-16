const SAFE_REPO_PART = /^[A-Za-z0-9_.-]+$/
const SEARCH_TEXT_MAX = 200
const LABEL_MAX = 50

export function normalizeIssueListState(value) {
  return value === "closed" ? "closed" : "open"
}

export function normalizePullListState(value) {
  if (value === "closed" || value === "merged") return value
  return "open"
}

/** Strip characters that would break out of a quoted search phrase. */
export function sanitizeGitHubSearchText(value) {
  if (typeof value !== "string") return ""
  return value
    .replace(/["\\\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, SEARCH_TEXT_MAX)
}

export function sanitizeGitHubLabel(value) {
  if (typeof value !== "string") return ""
  return value
    .replace(/["\\\r\n]/g, "")
    .trim()
    .slice(0, LABEL_MAX)
}

function quoteSearchText(value) {
  const cleaned = sanitizeGitHubSearchText(value)
  if (!cleaned) return ""
  return `"${cleaned}"`
}

function quoteLabel(value) {
  const cleaned = sanitizeGitHubLabel(value)
  if (!cleaned) return ""
  return `label:"${cleaned}"`
}

function safeRepo(owner, repo) {
  return SAFE_REPO_PART.test(owner) && SAFE_REPO_PART.test(repo)
}

/**
 * GitHub issue search query. User text is a quoted phrase so it cannot add
 * qualifiers such as `repo:` or `is:`. Returns null when the repo name is not
 * safe to interpolate.
 */
export function buildIssueSearchQuery({ owner, repo, state, label, text }) {
  if (!safeRepo(owner, repo)) return null
  const parts = [`repo:${owner}/${repo}`, "is:issue", `is:${normalizeIssueListState(state)}`]
  const quotedLabel = quoteLabel(label)
  if (quotedLabel) parts.push(quotedLabel)
  const quotedText = quoteSearchText(text)
  if (quotedText) parts.push(quotedText)
  return parts.join(" ")
}

/** GitHub pull request search query. `closed` means closed and not merged. */
export function buildPullSearchQuery({ owner, repo, state, text }) {
  if (!safeRepo(owner, repo)) return null
  const pullState = normalizePullListState(state)
  const parts = [`repo:${owner}/${repo}`, "is:pr"]
  if (pullState === "merged") parts.push("is:merged")
  else if (pullState === "closed") parts.push("is:closed", "is:unmerged")
  else parts.push("is:open")
  const quotedText = quoteSearchText(text)
  if (quotedText) parts.push(quotedText)
  return parts.join(" ")
}

export function mapGitHubUser(user) {
  if (!user || typeof user.login !== "string" || !user.login) return null
  return {
    login: user.login,
    id: user.id,
    avatarUrl: typeof user.avatar_url === "string" ? user.avatar_url : undefined,
  }
}

export function mapGitHubLabels(labels) {
  if (!Array.isArray(labels)) return []
  const mapped = []
  for (const label of labels) {
    if (!label || typeof label === "string") continue
    const name = typeof label.name === "string" ? label.name : ""
    if (!name) continue
    const color = typeof label.color === "string" && label.color ? label.color : undefined
    mapped.push(color ? { name, color } : { name })
  }
  return mapped
}

export function mapIssueListItem(item, sourceRepo) {
  if (!item || item.pull_request || typeof item.number !== "number") return null
  return {
    number: item.number,
    title: typeof item.title === "string" ? item.title : "",
    url: typeof item.html_url === "string" ? item.html_url : "",
    state: item.state === "closed" ? "closed" : "open",
    updatedAt: typeof item.updated_at === "string" ? item.updated_at : undefined,
    author: mapGitHubUser(item.user),
    labels: mapGitHubLabels(item.labels),
    sourceRepo: sourceRepo
      ? {
          owner: sourceRepo.owner,
          repo: sourceRepo.repo,
          source: typeof sourceRepo.source === "string" ? sourceRepo.source : "origin",
        }
      : undefined,
  }
}

export function mapIssueComment(comment) {
  if (!comment || typeof comment.id !== "number") return null
  return {
    id: comment.id,
    url: typeof comment.html_url === "string" ? comment.html_url : "",
    body: comment.body || "",
    createdAt: comment.created_at,
    updatedAt: comment.updated_at,
    author: mapGitHubUser(comment.user),
  }
}

export function mapIssueState(issue) {
  if (!issue || typeof issue.number !== "number") return null
  return {
    number: issue.number,
    title: typeof issue.title === "string" ? issue.title : "",
    url: typeof issue.html_url === "string" ? issue.html_url : "",
    state: issue.state === "closed" ? "closed" : "open",
  }
}

export function classifyPullState(pr) {
  if (!pr || typeof pr !== "object") return "open"
  if (pr.merged_at || pr.merged === true) return "merged"
  if (pr.state === "closed") return "closed"
  return "open"
}

export function mapPullListItem(pr, sourceRepo) {
  if (!pr || typeof pr.number !== "number") return null
  const headRepoRaw = pr.head?.repo
    ? {
        owner: pr.head.repo.owner?.login,
        repo: pr.head.repo.name,
        url: pr.head.repo.html_url,
        cloneUrl: pr.head.repo.clone_url,
        sshUrl: pr.head.repo.ssh_url,
      }
    : null
  const headRepo = headRepoRaw && headRepoRaw.owner && headRepoRaw.repo && headRepoRaw.url ? headRepoRaw : null
  const requested = Array.isArray(pr.requested_reviewers) ? pr.requested_reviewers.length : null
  return {
    number: pr.number,
    title: typeof pr.title === "string" ? pr.title : "",
    url: typeof pr.html_url === "string" ? pr.html_url : "",
    state: classifyPullState(pr),
    draft: Boolean(pr.draft),
    base: pr.base?.ref,
    head: pr.head?.ref,
    headSha: pr.head?.sha,
    mergeable: pr.mergeable,
    mergeableState: pr.mergeable_state,
    author: mapGitHubUser(pr.user),
    headLabel: pr.head?.label,
    headRepo,
    updatedAt: typeof pr.updated_at === "string" ? pr.updated_at : undefined,
    labels: mapGitHubLabels(pr.labels),
    ...(requested === null ? {} : { review: { requested } }),
    sourceRepo: sourceRepo
      ? {
          owner: sourceRepo.owner,
          repo: sourceRepo.repo,
          source: typeof sourceRepo.source === "string" ? sourceRepo.source : "origin",
        }
      : undefined,
  }
}
