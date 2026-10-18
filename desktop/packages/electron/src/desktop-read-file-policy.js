"use strict"

const path = require("path")
const os = require("os")
const fs = require("fs")

const DENIED_SEGMENTS = [
  ".ssh",
  ".aws",
  ".gnupg",
  ".gpg",
  ".docker",
  ".kube",
  ".azure",
  ".config/ax-code",
  ".config/gh",
  ".config/gcloud",
  ".config/git/credentials",
  ".config/google-chrome",
  ".config/chromium",
  // The app's own config root: the loopback session signing secret, the install
  // id and any future credential file live here.
  ".config/openchamber",
  ".config/openchamber/credentials",
  // The runtime's data dir: auth.json holds provider credentials, mcp-auth.json
  // the MCP ones, and .install-secret signs the install. All are written 0600 by
  // ax-code, and none of the basename rules below matches them.
  ".local/share/ax-code",
  ".local/share/keyrings",
  ".mozilla",
  "library/application support/firefox",
  "library/application support/google/chrome",
  "library/application support/chromium",
  "library/application support/microsoft edge",
  "library/keychains",
  // The other Apple credential stores in the same tree. Every browser profile is named above; these
  // hold the same kind of plaintext secret (session cookies) and were reachable: the read handler
  // returned the cookie jar as base64 while refusing Chrome's own copy of it.
  "library/cookies",
  "library/safari",
  "appdata/local/google/chrome",
  "appdata/local/microsoft/edge",
  // Firefox on Windows keeps profiles (logins.json, key4.db, cookies.sqlite)
  // under %APPDATA%\Mozilla — the same files the .mozilla rule already denies
  // on Linux.
  "appdata/roaming/mozilla",
]
const DENIED_BASENAMES = new Set([".env", ".git-credentials", ".netrc", ".npmrc", ".pypirc"])

const isInsideOrSameDirectory = (rootPath, targetPath, pathTools = path) => {
  if (!rootPath || !targetPath) return false
  const relative = pathTools.relative(rootPath, targetPath)
  // Only the parent hop itself escapes: a name that merely starts with ".."
  // (e.g. a "..notes" file under the root) is inside it.
  if (relative === ".." || relative.startsWith(`..${pathTools.sep}`) || pathTools.isAbsolute(relative)) {
    return false
  }
  return true
}

const toPosixRelativePath = (relativePath, pathTools = path) =>
  relativePath.split(pathTools.sep).filter(Boolean).join("/")

const resolveRoot = (value) => {
  if (!value) return value
  try {
    return fs.realpathSync(value)
  } catch {
    return value
  }
}

const isDesktopPathDenied = (realPath, options = {}) => {
  if (!realPath) return false
  const pathTools = options.pathTools || path
  const home = typeof options.home === "string" ? options.home : resolveRoot(os.homedir() || "")

  const underHome = isInsideOrSameDirectory(home, realPath, pathTools)
  const relFromHome = underHome ? toPosixRelativePath(pathTools.relative(home, realPath), pathTools).toLowerCase() : ""
  if (relFromHome && DENIED_SEGMENTS.some((segment) => relFromHome === segment || relFromHome.startsWith(`${segment}/`))) {
    return true
  }

  const basename = pathTools.basename(realPath).toLowerCase()
  return (
    DENIED_BASENAMES.has(basename) ||
    basename.startsWith(".env.") ||
    basename.endsWith(".pem") ||
    basename.endsWith(".key")
  )
}

const assertDesktopReadFileAllowed = (realPath, options = {}) => {
  const pathTools = options.pathTools || path
  const home = typeof options.home === "string" ? options.home : resolveRoot(os.homedir() || "")
  const tmp = typeof options.tmp === "string" ? options.tmp : resolveRoot(os.tmpdir() || "")

  const underHome = isInsideOrSameDirectory(home, realPath, pathTools)
  const underTmp = isInsideOrSameDirectory(tmp, realPath, pathTools)
  if (!underHome && !underTmp) throw new Error("File is outside the allowed workspace")

  if (isDesktopPathDenied(realPath, { ...options, home })) {
    throw new Error("Access to this path is not allowed")
  }
}

module.exports = {
  assertDesktopReadFileAllowed,
  isDesktopPathDenied,
  isInsideOrSameDirectory,
}
