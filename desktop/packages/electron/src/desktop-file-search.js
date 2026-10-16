"use strict"

const path = require("path")
const { isDesktopPathDenied } = require("./desktop-read-file-policy")

const toNativeSearchRelativePath = (rootPath, filePath, pathTools = path) => {
  return pathTools.relative(rootPath, filePath).split(pathTools.sep).filter(Boolean).join("/")
}

/**
 * Whether the native name search may use this root.
 *
 * The renderer names the root, so it is not necessarily a project directory: without this,
 * the search enumerated the credential stores that desktop_read_file refuses (HOME-relative
 * .ssh, .aws, .config/ax-code, .local/share/ax-code, and *.pem / *.key / .env* basenames),
 * giving a compromised renderer a name oracle for exactly the paths the read path denies.
 * The open-root policy itself is unchanged: a project outside HOME is still searchable.
 */
const shouldSearchNativeRoot = (rootPath, options = {}) => {
  if (!rootPath || typeof rootPath !== "string") return false
  return !isDesktopPathDenied(rootPath, options)
}

const shouldIncludeNativeSearchEntry = (entry, resultType, query) => {
  const normalizedType = resultType === "directory" ? "directory" : "file"
  const normalizedQuery = typeof query === "string" ? query.toLowerCase() : ""
  if (!entry || typeof entry.name !== "string") return false
  const matchesType =
    normalizedType === "directory"
      ? typeof entry.isDirectory === "function" && entry.isDirectory()
      : typeof entry.isFile === "function" && entry.isFile()
  return matchesType && entry.name.toLowerCase().includes(normalizedQuery)
}

module.exports = {
  shouldIncludeNativeSearchEntry,
  shouldSearchNativeRoot,
  toNativeSearchRelativePath,
}
