export type ThreadAnchor =
  | { status: "anchored"; startLine: number; endLine: number }
  | { status: "outdated"; originalStartLine: number }

/** Never use proximity to disambiguate: an agent may have copied or deleted the original block. */
export function reanchorThread(snippet: string, content: string, originalStartLine: number): ThreadAnchor {
  const outdated: ThreadAnchor = { status: "outdated", originalStartLine }
  if (!snippet.trim()) return outdated
  const lineAt = (offset: number) => content.slice(0, offset).split("\n").length
  const match = (needle: string, haystack: string, offsets?: number[]): ThreadAnchor | null => {
    const start = haystack.indexOf(needle)
    if (start < 0) return null
    if (haystack.indexOf(needle, start + 1) >= 0) return outdated
    return {
      status: "anchored",
      startLine: lineAt(offsets ? offsets[start] : start),
      endLine: lineAt(offsets ? offsets[start + needle.length - 1] : start + needle.length - 1),
    }
  }
  const exact = match(snippet, content)
  if (exact) return exact

  const offsets: number[] = []
  const characters: string[] = []
  for (let index = 0; index < content.length; index++) {
    if (/\s/.test(content[index])) continue
    offsets.push(index)
    characters.push(content[index])
  }
  return match(snippet.replace(/\s/g, ""), characters.join(""), offsets) ?? outdated
}
