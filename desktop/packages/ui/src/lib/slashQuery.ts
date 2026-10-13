export type SlashQuerySource = "command" | "snippet" | "magic-prompt"

export interface SlashQueryItem<T = unknown> {
  source: SlashQuerySource
  id: string
  name: string
  description?: string
  payload: T
}

const slashScore = (item: SlashQueryItem, query: string): number => {
  if (!query) return 10
  const name = item.name.trim().toLowerCase()
  const description = (item.description ?? "").toLowerCase()
  if (item.source === "command" && name === query) return 0
  if (name === query) return 1
  if (name.startsWith(query)) return 2
  if (name.includes(query) || description.includes(query)) return 3
  return 100
}

/**
 * One slash query across commands, snippets, and magic prompts.
 * An exact command name ranks ahead of every other hit.
 */
export function rankSlashQuery<T>(query: string, items: readonly SlashQueryItem<T>[]): SlashQueryItem<T>[] {
  const normalized = query.trim().toLowerCase().replace(/^\//, "")
  return items
    .map((item, index) => ({ item, index, score: slashScore(item, normalized) }))
    .filter((entry) => entry.score < 100)
    .sort((left, right) => left.score - right.score || left.index - right.index)
    .map((entry) => entry.item)
}
