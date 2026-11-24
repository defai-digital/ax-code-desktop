import { truncateToCodeUnits } from "@/lib/textTruncate"

/** Prefer the session title, then the first line of the prompt, then the id. */
export function quickDispatchSessionLabel(input: {
  title: string | null | undefined
  prompt: string
  sessionId: string
}): string {
  const title = input.title?.trim()
  if (title) return title
  const firstLine = input.prompt
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean)
  if (!firstLine) return input.sessionId
  return truncateToCodeUnits(firstLine, 80)
}
