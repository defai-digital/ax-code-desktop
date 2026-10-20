import { createHash } from "node:crypto"
import { createRequire } from "node:module"
import { describe, expect, test } from "vitest"

import { collectInlineScriptHashes } from "../../../shared/inline-script-hashes.mjs"

const require = createRequire(import.meta.url)
const packaged = require("./desktop-renderer-protocol.js")

const sha = (text) => `'sha256-${createHash("sha256").update(text, "utf8").digest("base64")}'`

describe("shared inline script hashes", () => {
  test("hashes executable inline scripts only", () => {
    const html = [
      "<script>a()</script>",
      '<script type="module">b()</script>',
      '<SCRIPT type="text/javascript">c()</SCRIPT >',
      '<script type="module" src="/assets/main.js"></script>',
      '<script type="application/json">{"d":1}</script>',
      '<script type="importmap">{"imports":{}}</script>',
      "<script>a()</script>",
    ].join("\n")
    expect(collectInlineScriptHashes(html)).toEqual([sha("a()"), sha("b()"), sha("c()")].sort())
  })

  test("hashes script text after HTML newline normalization", () => {
    expect(collectInlineScriptHashes("<script>\r\nx = 'é'\r\n</script>")).toEqual([sha("\nx = 'é'\n")])
    expect(collectInlineScriptHashes("<script>a\rb</script>")).toEqual([sha("a\nb")])
  })

  test("returns no hashes for a document without inline scripts", () => {
    expect(collectInlineScriptHashes('<html><head><script type="module" src="/main.js"></script></head></html>')).toEqual([])
    expect(collectInlineScriptHashes("")).toEqual([])
    expect(collectInlineScriptHashes(null)).toEqual([])
  })

  test("matches the packaged renderer export on CRLF input", () => {
    const html = "<script>\r\nboot()\r\n</script><script>a\rb</script>"
    expect(collectInlineScriptHashes(html)).toEqual(packaged.collectInlineScriptHashes(html))
    expect(collectInlineScriptHashes(html)).toEqual([sha("\nboot()\n"), sha("a\nb")].sort())
  })
})
