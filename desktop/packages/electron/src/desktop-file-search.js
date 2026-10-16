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

/** The real path of a candidate, or null when it cannot be resolved. */
const resolvePolicyRealPath = async (candidatePath, fsImpl) => {
  if (!fsImpl || typeof fsImpl.realpath !== "function") return null
  try {
    return await fsImpl.realpath(candidatePath)
  } catch {
    return null
  }
}

/**
 * The root a native search may walk, or null.
 *
 * The candidate is resolved through its symlinks before the policy sees it: `path.resolve` does not
 * follow them, so a link such as `/tmp/alias -> ~/.ssh` was not the string that names the denied
 * directory and the walk — `stat` and `readdir` both follow it — enumerated the credential store the
 * read path refuses. The read path resolves first for the same reason.
 */
const resolveSearchableNativeRoot = async (rootPath, options = {}) => {
  if (!rootPath || typeof rootPath !== "string") return null
  const realpath = options.realpath
  if (typeof realpath !== "function") return null

  let resolved
  try {
    resolved = await realpath(rootPath)
  } catch {
    return null
  }

  return shouldSearchNativeRoot(resolved, options) ? resolved : null
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

const NATIVE_SEARCH_SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".hg",
  ".svn",
  "dist",
  "build",
  ".next",
  ".cache",
  "target",
])

/**
 * Walk a root for name matches.
 *
 * The denied-path policy applies to every entry, not only to the root: a search rooted at an allowed
 * directory — HOME itself, or `~/.config`, which the policy allows because only its longer denied
 * prefixes are refused — otherwise enumerated the credential stores `desktop_read_file` refuses
 * (`.config/gh/hosts.yml`, the runtime's auth files, browser profiles, keychains), which is the name
 * oracle `shouldSearchNativeRoot` exists to prevent. Only real directories are recursed into, so a
 * link is never followed out of the tree.
 */
const collectNativeSearchResults = async ({
  root,
  query,
  includeHidden = false,
  resultType = "file",
  limit = 200,
  options = {},
  fs: fsImpl,
  pathTools = path,
  maxDepth = 12,
}) => {
  const results = []
  const walk = async (dir, depth) => {
    if (results.length >= limit || depth > maxDepth) return
    let entries
    try {
      entries = await fsImpl.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (results.length >= limit) return
      if (entry.name.startsWith(".") && !includeHidden) continue
      if (entry.isDirectory() && NATIVE_SEARCH_SKIP_DIRS.has(entry.name)) continue
      const full = pathTools.join(dir, entry.name)
      if (!shouldSearchNativeRoot(full, options)) continue
      if (entry.isDirectory()) {
        // The walk keeps the caller's paths, but the HOME-relative deny rules compare strings — so a directory
        // entered through a symlinked root (`/tmp/alias` -> `~/.config`) is not the string that names the denied
        // store and used to be enumerated. Resolve the directory before descending; the basename rules
        // (*.pem, *.key, .env*) need no resolution, and names are what this search returns.
        const resolvedDir = await resolvePolicyRealPath(full, fsImpl)
        if (resolvedDir && !shouldSearchNativeRoot(resolvedDir, options)) continue
      } else if (shouldIncludeNativeSearchEntry(entry, resultType, query)) {
        // A file needs the same resolution, and only a *matching* one pays for it: a search rooted at a symlinked
        // directory returned `credentials` — the name of a path `desktop_read_file` refuses, and the walk follows
        // the link — because the literal `/tmp/alias/credentials` names no denied prefix.
        const resolvedEntry = await resolvePolicyRealPath(full, fsImpl)
        if (resolvedEntry && !shouldSearchNativeRoot(resolvedEntry, options)) continue
      }
      if (shouldIncludeNativeSearchEntry(entry, resultType, query)) {
        const extension = entry.isDirectory() ? undefined : pathTools.extname(entry.name).replace(/^\./, "") || undefined
        results.push({
          name: entry.name,
          path: full,
          relativePath: toNativeSearchRelativePath(root, full, pathTools),
          ...(extension ? { extension } : {}),
        })
      }
      if (entry.isDirectory()) await walk(full, depth + 1)
    }
  }

  await walk(root, 0)
  return results
}

module.exports = {
  collectNativeSearchResults,
  resolveSearchableNativeRoot,
  shouldIncludeNativeSearchEntry,
  shouldSearchNativeRoot,
  toNativeSearchRelativePath,
}
