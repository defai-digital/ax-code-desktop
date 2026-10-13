const NUMBER_PATH_PATTERNS = {
  issues: /\/issues\/(\d+)(?:\b|\/|$)/i,
  pull: /\/pull\/(\d+)(?:\b|\/|$)/i,
} as const

export type GitHubNumberKind = keyof typeof NUMBER_PATH_PATTERNS

export const parseGitHubNumber = (value: string, kind: GitHubNumberKind): number | null => {
  const trimmed = value.trim()
  if (!trimmed) return null

  const urlMatch = trimmed.match(NUMBER_PATH_PATTERNS[kind])
  if (urlMatch) {
    const parsed = Number(urlMatch[1])
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null
  }

  const hashMatch = trimmed.match(/^#?(\d+)$/)
  if (hashMatch) {
    const parsed = Number(hashMatch[1])
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null
  }

  return null
}

export const filterGitHubItemsByQuery = <T extends { number: number; title: string }>(
  items: T[],
  query: string,
): T[] => {
  const q = query.trim().toLowerCase()
  if (!q) return items
  return items.filter((item) => {
    if (String(item.number) === q.replace(/^#/, "")) return true
    return item.title.toLowerCase().includes(q)
  })
}
