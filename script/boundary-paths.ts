import path from "node:path"

// Both boundary checkers live in script/ and resolve the repository root the same
// way, so the path helpers they shared verbatim now own that computation once.
const root = path.resolve(import.meta.dirname, "..")

export function normalize(value: string) {
  const withoutQuery = value.split(/[?#]/, 1)[0] ?? value
  return path.posix.normalize(withoutQuery.replaceAll("\\", "/"))
}

export function rel(file: string) {
  const value = path.isAbsolute(file) ? path.relative(root, file) : file
  return normalize(value)
}

export function hasPathPrefix(value: string, prefix: string) {
  return value === prefix || value.startsWith(`${prefix}/`)
}
