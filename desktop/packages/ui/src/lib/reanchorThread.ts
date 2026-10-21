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
  // Windows checkouts may hold CRLF while the snippet has LF, or the reverse. Matching with line endings unified keeps the
  // exact match (and its line numbers, which CRLF and LF count the same) before the whitespace-blind fallback.
  if (content.includes("\r") || snippet.includes("\r")) {
    const unified = (value: string) => value.replace(/\r\n?/g, "\n")
    const unifiedContent = unified(content)
    const unifiedSnippet = unified(snippet)
    const start = unifiedContent.indexOf(unifiedSnippet)
    if (start >= 0) {
      if (unifiedContent.indexOf(unifiedSnippet, start + 1) >= 0) return outdated
      const unifiedLineAt = (offset: number) => unifiedContent.slice(0, offset).split("\n").length
      return {
        status: "anchored",
        startLine: unifiedLineAt(start),
        endLine: unifiedLineAt(start + unifiedSnippet.length - 1),
      }
    }
  }

  const offsets: number[] = []
  const characters: string[] = []
  for (let index = 0; index < content.length; index++) {
    if (/\s/.test(content[index])) continue
    offsets.push(index)
    characters.push(content[index])
  }
  return match(snippet.replace(/\s/g, ""), characters.join(""), offsets) ?? outdated
}
