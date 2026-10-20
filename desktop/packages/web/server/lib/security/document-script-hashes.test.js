import { createHash } from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, describe, expect, it } from "vitest"

import { collectInlineScriptHashes } from "../../../../../shared/inline-script-hashes.mjs"
import { resolveServedDistPath } from "../ax-code/static-routes-runtime.js"
import { buildWebServerCsp } from "./response-headers.js"
import {
  APP_DOCUMENT_NAMES,
  createDocumentScriptHashes,
  resolveAppDocumentName,
  resolveServedWebRoot,
} from "./document-script-hashes.js"

const sha = (text) => `'sha256-${createHash("sha256").update(text, "utf8").digest("base64")}'`
const here = path.dirname(fileURLToPath(import.meta.url))
const webRoot = path.resolve(here, "..", "..", "..")

const tempDirs = []
const makeRoot = (files) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "document-script-hashes-"))
  tempDirs.push(dir)
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), content)
  }
  return dir
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

describe("document script hashes", () => {
  it("resolves the app document for a request path", () => {
    expect(resolveAppDocumentName("/")).toBe("index.html")
    expect(resolveAppDocumentName("/index.html")).toBe("index.html")
    expect(resolveAppDocumentName("/mini-chat.html")).toBe("mini-chat.html")
    expect(resolveAppDocumentName("/supervision.html?mode=popout")).toBe("supervision.html")
    expect(resolveAppDocumentName("/session/abc")).toBe("index.html")
    expect(resolveAppDocumentName(undefined)).toBe("index.html")
  })

  it("selects a document only for its exact root path", () => {
    // Static serving only ever serves these names at the root; a nested
    // path falls back to index.html.
    expect(resolveAppDocumentName("/foo/supervision.html")).toBe("index.html")
    expect(resolveAppDocumentName("/foo/mini-chat.html")).toBe("index.html")
    expect(resolveAppDocumentName("/foo/index.html")).toBe("index.html")
    expect(resolveAppDocumentName("/supervision.html/extra")).toBe("index.html")
    expect(resolveAppDocumentName("//supervision.html")).toBe("index.html")
    expect(resolveAppDocumentName("/SUPERVISION.HTML")).toBe("index.html")
    expect(resolveAppDocumentName("supervision.html")).toBe("index.html")
  })

  it("resolves the default root through the same resolver as the static routes", () => {
    const serverDir = path.resolve(here, "..", "..")
    expect(resolveServedWebRoot({ AX_CODE_DESKTOP_DIST_DIR: " /tmp/staged-dist " })).toBe(
      resolveServedDistPath({ env: { AX_CODE_DESKTOP_DIST_DIR: " /tmp/staged-dist " }, __dirname: serverDir, path }),
    )
    expect(resolveServedWebRoot({ AX_CODE_DESKTOP_DIST_DIR: " /tmp/staged-dist " })).toBe("/tmp/staged-dist")
    expect(resolveServedWebRoot({})).toBe(resolveServedDistPath({ env: {}, __dirname: serverDir, path }))
    expect(resolveServedWebRoot({})).toBe(path.join(serverDir, "..", "dist"))
    expect(resolveServedWebRoot({ AX_CODE_DESKTOP_DIST_DIR: "   " })).toBe(path.join(serverDir, "..", "dist"))
  })

  it("yields no hashes for a document without inline scripts", () => {
    const root = makeRoot({ "index.html": '<script type="module" src="/main.js"></script>' })
    const provider = createDocumentScriptHashes({ rootDir: root })
    expect(provider.getHashes("index.html")).toEqual([])
    expect(provider.getHashesForPath("/")).toEqual([])
  })

  it("yields no hashes when the served document is missing", () => {
    const root = makeRoot({})
    const provider = createDocumentScriptHashes({ rootDir: root })
    expect(provider.getHashes("index.html")).toEqual([])
  })

  it("changes the hash when a script changes, re-reading only after the mtime moves", () => {
    const entry = { content: "<script>one()</script>", mtimeMs: 1000 }
    const fsImpl = {
      statSync: () => ({ mtimeMs: entry.mtimeMs }),
      readFileSync: () => entry.content,
    }
    const provider = createDocumentScriptHashes({ rootDir: "/served", fsImpl })
    expect(provider.getHashes("index.html")).toEqual([sha("one()")])

    entry.content = "<script>two()</script>"
    expect(provider.getHashes("index.html")).toEqual([sha("one()")])

    entry.mtimeMs = 2000
    expect(provider.getHashes("index.html")).toEqual([sha("two()")])
  })

  it.each([
    ["size", { size: 99 }],
    ["ctimeMs", { ctimeMs: 2000 }],
    ["ino", { ino: 42 }],
  ])("re-reads when only the file %s changes, for a symlink retarget with an identical mtime", (_field, change) => {
    const entry = {
      content: "<script>one()</script>",
      stat: { mtimeMs: 1000, size: 10, ctimeMs: 1000, ino: 7 },
    }
    const fsImpl = {
      statSync: () => ({ ...entry.stat }),
      readFileSync: () => entry.content,
    }
    const provider = createDocumentScriptHashes({ rootDir: "/served", fsImpl })
    expect(provider.getHashes("index.html")).toEqual([sha("one()")])
    entry.content = "<script>two()</script>"
    // Nothing the cache key watches has moved yet.
    expect(provider.getHashes("index.html")).toEqual([sha("one()")])
    Object.assign(entry.stat, change)
    expect(provider.getHashes("index.html")).toEqual([sha("two()")])
  })

  it("hashes served bytes after CRLF normalization, like the packaged renderer", () => {
    const root = makeRoot({ "index.html": "<script>\r\nboot()\r\n</script>" })
    const provider = createDocumentScriptHashes({ rootDir: root })
    expect(provider.getHashes("index.html")).toEqual([sha("\nboot()\n")])
  })

  it("puts every inline script hash of each real served document in the policy", () => {
    const provider = createDocumentScriptHashes({ rootDir: webRoot })
    for (const name of APP_DOCUMENT_NAMES) {
      const html = fs.readFileSync(path.join(webRoot, name), "utf8")
      const expected = collectInlineScriptHashes(html)
      const csp = buildWebServerCsp({ path: `/${name}` }, provider.getHashesForPath)
      for (const hash of expected) {
        expect(csp).toContain(hash)
      }
      const scriptSrc =
        csp
          .split(";")
          .map((part) => part.trim())
          .find((part) => part.startsWith("script-src ")) || ""
      expect(scriptSrc).not.toContain("'unsafe-inline'")
    }
    const indexHashes = collectInlineScriptHashes(fs.readFileSync(path.join(webRoot, "index.html"), "utf8"))
    expect(indexHashes.length).toBeGreaterThan(0)
  })

  it("covers every executable inline script of the real document, from the Vite build when present", () => {
    const distRoot = path.join(webRoot, "dist")
    const root = fs.existsSync(path.join(distRoot, "index.html")) ? distRoot : webRoot
    const provider = createDocumentScriptHashes({ rootDir: root })
    const scriptSrcOf = (csp) =>
      csp
        .split(";")
        .map((part) => part.trim())
        .find((part) => part.startsWith("script-src ")) || ""
    for (const name of APP_DOCUMENT_NAMES) {
      const html = fs.readFileSync(path.join(root, name), "utf8")
      const expected = collectInlineScriptHashes(html)
      const csp = buildWebServerCsp({ path: `/${name}` }, provider.getHashesForPath)
      for (const hash of expected) expect(scriptSrcOf(csp)).toContain(hash)
      expect(scriptSrcOf(csp)).not.toContain("'unsafe-inline'")
    }
    // A nested path is served index.html, so it gets index.html's hashes.
    const nested = buildWebServerCsp({ path: "/foo/supervision.html" }, provider.getHashesForPath)
    const index = buildWebServerCsp({ path: "/index.html" }, provider.getHashesForPath)
    expect(scriptSrcOf(nested)).toBe(scriptSrcOf(index))
    const supervision = buildWebServerCsp({ path: "/supervision.html" }, provider.getHashesForPath)
    if (scriptSrcOf(supervision) !== scriptSrcOf(index)) {
      expect(scriptSrcOf(nested)).not.toBe(scriptSrcOf(supervision))
    }
  })
})
