import { isUtf8 } from "buffer"

// Both images must name the declared file: a foreign pre-image can remove another index entry
// even when the post-image is correct. Additions and deletions use /dev/null for one image.
// git writes a header path that needs escaping (non-ASCII, quotes, control
// characters) as a C-style quoted string with octal byte escapes.
const C_QUOTE_ESCAPES = { a: 7, b: 8, f: 12, n: 10, r: 13, t: 9, v: 11, '"': 34, "\\": 92 }
const unquoteGitHeaderPath = (value) => {
  if (!value.startsWith('"')) return value
  if (!value.endsWith('"') || value.length < 2) return null
  const bytes = []
  const body = value.slice(1, -1)
  for (let index = 0; index < body.length; index += 1) {
    const character = body[index]
    if (character !== "\\") {
      if (character === '"') return null
      // Iterating UTF-16 units separately corrupts an unescaped non-BMP character (core.quotePath=false).
      const codePoint = body.codePointAt(index)
      bytes.push(...Buffer.from(String.fromCodePoint(codePoint), "utf8"))
      if (codePoint > 0xffff) index += 1
      continue
    }
    const next = body[index + 1]
    if (/[0-7]/.test(next ?? "")) {
      const octal = body.slice(index + 1, index + 4)
      if (!/^[0-3][0-7]{2}$/.test(octal)) return null
      bytes.push(parseInt(octal, 8))
      index += 3
      continue
    }
    if (!Object.hasOwn(C_QUOTE_ESCAPES, next)) return null
    bytes.push(C_QUOTE_ESCAPES[next])
    index += 1
  }
  const decoded = Buffer.from(bytes)
  // Lossy UTF-8 replacement could equate a different raw Git path with the declared Unicode filename.
  return isUtf8(decoded) && !decoded.includes(0) ? decoded.toString("utf8") : null
}

const HUNK_HEADER_PATTERN = /^@@ -\d+(?:,(\d+))? \+\d+(?:,(\d+))? @@/

/**
 * The file sections a patch declares: its `--- `/`+++ ` header pairs that are not part of a hunk body.
 *
 * A hunk body is content — its lines start with ` `, `+`, `-` or `\` — and a removed `-- old` line directly above
 * the added `++ new` line that replaces it renders as `--- old` / `+++ new`, which reads exactly like a header.
 * The body is consumed by the line counts its `@@ ` header declares (a `\ No newline` marker is not among them, so
 * it is skipped), and only pairs outside every body are sections. Counting `diff --git` lines is not enough on
 * its own: a patch can start another file's section straight at a `--- `/`+++ ` pair.
 *
 * The two counts are tracked separately because a context line belongs to both: draining them together would
 * consume `oldCount + newCount` lines for a body of `max(oldCount, newCount)` and read the lines that follow the
 * hunk as body. That both hid a second file section — the guard counts sections, so it saw only one — and read a
 * later hunk's own `--- x`/`+++ y` body lines as a second section.
 */
const declaredFileSections = (lines) => {
  const sections = []
  // Lines outside every hunk body, which is where git reads extended headers.
  const headerLines = []
  let index = 0
  while (index < lines.length) {
    const hunk = HUNK_HEADER_PATTERN.exec(lines[index])
    if (hunk) {
      let oldRemaining = hunk[1] === undefined ? 1 : Number(hunk[1])
      let newRemaining = hunk[2] === undefined ? 1 : Number(hunk[2])
      index += 1
      while ((oldRemaining > 0 || newRemaining > 0) && index < lines.length) {
        const line = lines[index]
        if (line.startsWith("\\ ")) {
          index += 1
          continue
        }
        if (!line.startsWith("+")) {
          oldRemaining -= 1
        }
        if (!line.startsWith("-")) {
          newRemaining -= 1
        }
        index += 1
      }
      continue
    }
    if (lines[index].startsWith("--- ") && (lines[index + 1] ?? "").startsWith("+++ ")) {
      sections.push({ preImage: lines[index], postImage: lines[index + 1] })
      index += 2
      continue
    }
    headerLines.push(lines[index])
    index += 1
  }
  return { sections, headerLines }
}

// A `diff --git` section that only renames, copies, or deletes or adds an empty file carries no `---`/`+++` pair,
// so counting pairs missed it: a hunk for the declared file followed by `rename from o` / `rename to moved` passed
// the one-file guard and `git apply --cached` renamed another file in the index. A hunk never renames or copies.
const FOREIGN_SECTION_HEADER_PATTERN = /^(rename from |rename to |copy from |copy to )/

const hasForeignSectionHeader = (headerLines) =>
  headerLines.filter((line) => line.startsWith("diff --git ")).length > 1 ||
  headerLines.some((line) => FOREIGN_SECTION_HEADER_PATTERN.test(line))

export const patchTargetsDeclaredPath = (patchText, repoPath) => {
  const allLines = patchText.split("\n")
  // One file only: a second section would let the patch edit another file, whether it carries its own
  // `diff --git` line or starts straight at a `--- `/`+++ ` pair.
  const { sections, headerLines } = declaredFileSections(allLines)
  if (sections.length !== 1 || hasForeignSectionHeader(headerLines)) {
    return false
  }
  const [section] = sections
  // Unquoted Git paths end at a tab, including the tab Git emits after a path containing spaces.
  // Trimming the field would change a literal trailing-space filename.
  const preImagePath = unquoteGitHeaderPath(section.preImage.slice(4).split("\t", 1)[0])
  const postImagePath = unquoteGitHeaderPath(section.postImage.slice(4).split("\t", 1)[0])
  const matchesPreImage = preImagePath === `a/${repoPath}`
  const matchesPostImage = postImagePath === `b/${repoPath}`
  return (
    (matchesPreImage && matchesPostImage) ||
    (preImagePath === "/dev/null" && matchesPostImage) ||
    (matchesPreImage && postImagePath === "/dev/null")
  )
}
