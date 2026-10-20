import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { collectInlineScriptHashes } from "../../../../../shared/inline-script-hashes.mjs"
import { resolveServedDistPath } from "../ax-code/static-routes-runtime.js"

// The HTML documents the web server serves for the app itself. The packaged
// renderer hashes the bytes it serves (ADR-018); the web server does the same
// so its app document needs no 'unsafe-inline' script allowance.
export const APP_DOCUMENT_NAMES = ["index.html", "mini-chat.html", "supervision.html"]

const DEFAULT_DOCUMENT = "index.html"

export const resolveAppDocumentName = (pathname) => {
  const value = typeof pathname === "string" ? pathname.split("?")[0] : ""
  // Static serving only serves these names at the root; every other path
  // falls back to index.html.
  for (const name of APP_DOCUMENT_NAMES) {
    if (value === `/${name}`) return name
  }
  return DEFAULT_DOCUMENT
}

// The root the static routes serve from, resolved by the same function
// they use: the packaged server is pointed at the staged web-dist, a
// source checkout serves the Vite build output next to the server.
export const resolveServedWebRoot = (env = process.env) => {
  const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..")
  return resolveServedDistPath({ env, __dirname: serverDir, path })
}

export const createDocumentScriptHashes = ({ rootDir, fsImpl = fs } = {}) => {
  const root = typeof rootDir === "string" && rootDir ? path.resolve(rootDir) : resolveServedWebRoot()
  const cache = new Map()

  const getHashes = (name) => {
    const document = APP_DOCUMENT_NAMES.includes(name) ? name : DEFAULT_DOCUMENT
    const file = path.join(root, document)
    let stat
    try {
      stat = fsImpl.statSync(file)
    } catch {
      cache.delete(file)
      return []
    }
    const cached = cache.get(file)
    if (
      cached &&
      cached.mtimeMs === stat.mtimeMs &&
      cached.size === stat.size &&
      cached.ctimeMs === stat.ctimeMs &&
      cached.ino === stat.ino
    ) {
      return cached.hashes
    }
    let html
    try {
      html = fsImpl.readFileSync(file, "utf8")
    } catch {
      cache.delete(file)
      return []
    }
    const hashes = collectInlineScriptHashes(html)
    cache.set(file, { mtimeMs: stat.mtimeMs, size: stat.size, ctimeMs: stat.ctimeMs, ino: stat.ino, hashes })
    return hashes
  }

  return {
    getHashes,
    getHashesForPath: (pathname) => getHashes(resolveAppDocumentName(pathname)),
  }
}

let sharedProvider

export const getAppDocumentScriptHashes = (pathname) => {
  sharedProvider ??= createDocumentScriptHashes()
  return sharedProvider.getHashesForPath(pathname)
}
