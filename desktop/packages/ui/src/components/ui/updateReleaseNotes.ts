function decodeHtmlEntities(value: string): string {
  const namedEntities: Record<string, string> = {
    amp: "&",
    gt: ">",
    lt: "<",
    quot: '"',
    apos: "'",
    nbsp: " ",
  }
  // `Number.isFinite` accepts a code point above the Unicode maximum, where `String.fromCodePoint`
  // throws a RangeError — during the render that builds the update dialog. Anything out of range is
  // left as written.
  const decodeCodePoint = (codePoint: number, fallback: string): string => {
    if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) {
      return fallback
    }
    return String.fromCodePoint(codePoint)
  }
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    const key = entity.toLowerCase()
    if (key.startsWith("#x")) {
      return decodeCodePoint(Number.parseInt(key.slice(2), 16), match)
    }
    if (key.startsWith("#")) {
      return decodeCodePoint(Number.parseInt(key.slice(1), 10), match)
    }
    return namedEntities[key] ?? match
  })
}

function removeRawTextElementBlocks(value: string, tagName: string): string {
  // The block search is case-insensitive without a lowercased copy: `İ` lowercases to two code units, so offsets
  // found in the folded copy do not line up with the string they are applied to, and the slice left a fragment of
  // the block in the notes. A regex with `i` indexes the original string.
  const escapeRegExp = (needle: string) => needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const startPattern = new RegExp(`<${escapeRegExp(tagName)}`, "i")
  const closePattern = new RegExp(`</${escapeRegExp(tagName)}`, "i")
  let remaining = value
  let output = ""

  while (remaining.length > 0) {
    const startMatch = startPattern.exec(remaining)
    if (!startMatch) {
      output += remaining
      break
    }
    const start = startMatch.index

    const startTagEnd = remaining.indexOf(">", start + startMatch[0].length)
    if (startTagEnd === -1) {
      output += remaining.slice(0, start)
      break
    }

    const afterStartTag = remaining.slice(startTagEnd + 1)
    const closeMatch = closePattern.exec(afterStartTag)
    if (!closeMatch) {
      output += remaining.slice(0, start)
      break
    }
    const closeStart = startTagEnd + 1 + closeMatch.index

    const closeEnd = remaining.indexOf(">", closeStart + closeMatch[0].length)
    if (closeEnd === -1) {
      output += remaining.slice(0, start)
      break
    }

    output += remaining.slice(0, start)
    remaining = remaining.slice(closeEnd + 1)
  }

  return output
}

function tagNameStartOffset(value: string, index: number): number | undefined {
  if (value[index] !== "<") return undefined
  const offset = value[index + 1] === "/" ? 2 : 1
  const next = value[index + offset]
  return next && /[a-z]/i.test(next) ? offset : undefined
}

function hasHtmlTag(value: string): boolean {
  for (let i = 0; i < value.length - 2; i++) {
    if (tagNameStartOffset(value, i) !== undefined) return true
  }
  return false
}

function readTagName(tag: string): { closing: boolean; name: string } {
  const trimmed = tag.trimStart()
  const closing = trimmed.startsWith("/")
  const start = closing ? 1 : 0
  let end = start
  while (end < trimmed.length && /[a-z0-9]/i.test(trimmed[end] ?? "")) end++
  return { closing, name: trimmed.slice(start, end).toLowerCase() }
}

function markdownForTag(tag: string): string {
  const { closing, name } = readTagName(tag)
  if (/^h[1-6]$/.test(name)) {
    return closing ? "\n\n" : `${"#".repeat(Math.max(2, Number(name.slice(1))))} `
  }
  if (name === "li") return closing ? "\n" : "- "
  if (name === "br") return "\n"
  if (name === "p") return closing ? "\n\n" : ""
  if (name === "ul" || name === "ol" || name === "div" || name === "section" || name === "article") {
    return closing ? "\n" : ""
  }
  return ""
}

function htmlToMarkdownText(value: string): string {
  let remaining = value
  let output = ""

  while (remaining.length > 0) {
    const start = remaining.indexOf("<")
    if (start === -1) {
      output += remaining
      break
    }

    output += remaining.slice(0, start)
    if (tagNameStartOffset(remaining, start) === undefined) {
      output += "<"
      remaining = remaining.slice(start + 1)
      continue
    }

    const end = remaining.indexOf(">", start + 1)
    if (end === -1) {
      output += remaining.slice(start)
      break
    }
    output += markdownForTag(remaining.slice(start + 1, end))
    remaining = remaining.slice(end + 1)
  }

  return output
}

export function normalizeReleaseNotesForMarkdown(body: string): string {
  if (!hasHtmlTag(body)) {
    return body
  }

  const safeBody = removeRawTextElementBlocks(removeRawTextElementBlocks(decodeHtmlEntities(body), "script"), "style")

  return htmlToMarkdownText(safeBody)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

const GITHUB_RELEASES_URL = "https://github.com/defai-digital/ax-code/releases"

export type ChangelogSectionEntry = {
  version: string
  dateLabel: string
  content: string
}

export type ParsedChangelog =
  | { kind: "raw"; title: string; content: string }
  | { kind: "sections"; title: string; sections: ChangelogSectionEntry[] }

const processChangelogMentions = (content: string): string => {
  // Convert @username to markdown links so they can be styled via css
  return content.replace(/(^|[^a-zA-Z0-9])@([a-zA-Z0-9-]+)/g, "$1[@$2](https://github.com/$2)")
}

const compareSemverDesc = (a: string, b: string): number => {
  const pa = a.split(".").map((v) => Number.parseInt(v, 10))
  const pb = b.split(".").map((v) => Number.parseInt(v, 10))
  for (let i = 0; i < 3; i += 1) {
    const da = Number.isFinite(pa[i]) ? (pa[i] as number) : 0
    const db = Number.isFinite(pb[i]) ? (pb[i] as number) : 0
    if (da !== db) {
      return db - da
    }
  }
  return 0
}

/** The body of a `## [x.y.z] - date` section, with its heading removed. */
const stripChangelogHeading = (sectionRaw: string): string =>
  sectionRaw.replace(/^## \[[^\]]+\] - \d{4}-\d{2}-\d{2}\s*\n?/, "").trim()

const parseChangelogSections = (body: string) => {
  const re = /^## \[(\d+\.\d+\.\d+)\] - (\d{4}-\d{2}-\d{2})\s*$/gm
  const matches: Array<{ version: string; date: string; start: number }> = []

  let m: RegExpExecArray | null
  while ((m = re.exec(body)) !== null) {
    matches.push({ version: m[1] ?? "", date: m[2] ?? "", start: m.index })
  }

  if (matches.length === 0) {
    return []
  }

  return matches.map((match, idx) => {
    const end = matches[idx + 1]?.start ?? body.length
    const raw = body.slice(match.start, end).trim()
    return { version: match.version, date: match.date, start: match.start, end, raw }
  })
}

/**
 * The release notes split into the versions they describe, or the whole body when it carries no version headings.
 *
 * A section whose heading is all it has renders empty: the earlier fallback to the whole body printed every
 * version's notes under the empty one, and every heading this parse accepts is one the strip removes, so the
 * fallback could only ever fire for a section that really is empty.
 */
export function parseChangelog(body: string, title: string): ParsedChangelog {
  const sections = parseChangelogSections(body)

  if (sections.length === 0) {
    return { kind: "raw", title, content: processChangelogMentions(body) }
  }

  const sorted = [...sections].sort((a, b) => compareSemverDesc(a.version, b.version))
  return {
    kind: "sections",
    title,
    sections: sorted.map((section) => ({
      version: section.version,
      dateLabel: formatIsoDateForUI(section.date),
      content: processChangelogMentions(stripChangelogHeading(section.raw)),
    })),
  }
}

function formatIsoDateForUI(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00`)
  if (Number.isNaN(d.getTime())) {
    return isoDate
  }
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(d)
}

export function buildUpdateReleaseUrl(version: string | undefined): string {
  const trimmedVersion = version?.trim()
  if (!trimmedVersion) {
    return GITHUB_RELEASES_URL
  }

  if (trimmedVersion.startsWith("desktop-v") || trimmedVersion.startsWith("v")) {
    return `${GITHUB_RELEASES_URL}/tag/${trimmedVersion}`
  }

  return `${GITHUB_RELEASES_URL}/tag/v${trimmedVersion}`
}
