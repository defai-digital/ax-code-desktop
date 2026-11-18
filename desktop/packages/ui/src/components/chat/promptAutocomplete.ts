import { detectTriggerQueryAtCursor } from "./chatInputMentions"

export type PromptAutocomplete = { kind: "command" | "snippet" | "mention"; query: string } | { kind: "none" }

export const resolvePromptAutocomplete = (value: string, cursorPosition: number): PromptAutocomplete => {
  if (value.startsWith("/")) {
    const firstSpace = value.indexOf(" ")
    const firstNewline = value.indexOf("\n")
    const commandEnd = Math.min(
      firstSpace === -1 ? value.length : firstSpace,
      firstNewline === -1 ? value.length : firstNewline,
    )
    if (cursorPosition <= commandEnd && firstSpace === -1) {
      return { kind: "command", query: value.substring(1, commandEnd) }
    }
  }
  const beforeCursor = value.substring(0, cursorPosition)
  const snippet = detectTriggerQueryAtCursor(beforeCursor, "#")
  if (snippet !== null) return { kind: "snippet", query: snippet }
  const mention = detectTriggerQueryAtCursor(beforeCursor, "@")
  if (mention !== null) return { kind: "mention", query: mention }
  return { kind: "none" }
}
