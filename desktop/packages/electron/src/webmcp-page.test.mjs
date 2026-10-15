import { describe, expect, test } from "vitest"
import { createRequire } from "node:module"
import { randomUUID } from "node:crypto"
const require = createRequire(import.meta.url)
const page = require("./webmcp-page.js")
const { JSDOM } = require(require.resolve("jsdom", { paths: [new URL("../../ui/", import.meta.url).pathname] }))

// Runs the real fixed program against a DOM; jsdom has no layout, so every element counts as rendered.
function load(html) {
  const dom = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true })
  const { window } = dom
  window.Element.prototype.getClientRects = function () {
    return [{}]
  }
  window.Element.prototype.scrollIntoView = () => {}
  Object.defineProperty(window.HTMLElement.prototype, "innerText", {
    get() {
      return this.textContent
    },
  })
  const run = (payload) => window.eval(page.program(payload))
  return { window, run }
}
const read = (run) => {
  const readId = randomUUID()
  return { readId, result: run({ op: "read", readId, maxText: 8000, maxElements: 150 }) }
}

describe("agent page program", () => {
  test("reads text and an outline with references, without password values or link queries", () => {
    const { run } = load(`<body><h1>Flights</h1><a href="https://x.test/a?token=secret">Go</a>
      <input placeholder="From" value="YYZ"><input type="password" value="hunter2" aria-label="Pass">
      <form><button>Search</button></form><select aria-label="Cabin"><option>Economy</option><option>Business</option></select></body>`)
    const { result } = read(run)
    expect(result.text).toContain("Flights")
    expect(JSON.stringify(result)).not.toContain("hunter2")
    expect(JSON.stringify(result)).not.toContain("secret")
    const byName = Object.fromEntries(result.outline.map((entry) => [entry.name, entry]))
    expect(byName.Go.href).toBe("https://x.test/a")
    expect(byName.From.value).toBe("YYZ")
    expect(byName.Search.submit).toBe(true)
    expect(byName.Cabin.options).toEqual(["Economy", "Business"])
    expect(byName.Pass.kind).toBe("password")
  })
  test("clicks, types and selects only through references from the latest read", () => {
    const { window, run } = load(
      `<body><button id="b">Hit</button><input id="i" aria-label="City"><select id="s" aria-label="Cabin"><option value="e">Economy</option><option value="b">Business</option></select></body>`,
    )
    let clicks = 0
    window.document.getElementById("b").addEventListener("click", () => clicks++)
    const { readId, result } = read(run)
    const ref = (name) => result.outline.find((entry) => entry.name === name).ref
    expect(run({ op: "act", readId, ref: ref("Hit"), how: "click" })).toEqual({ ok: true })
    expect(clicks).toBe(1)
    expect(run({ op: "act", readId, ref: ref("City"), how: "type", text: "Tokyo" })).toEqual({ ok: true })
    expect(window.document.getElementById("i").value).toBe("Tokyo")
    expect(run({ op: "act", readId, ref: ref("Cabin"), how: "select", text: "Business" })).toEqual({ ok: true })
    expect(window.document.getElementById("s").value).toBe("b")
    expect(run({ op: "act", readId, ref: ref("Cabin"), how: "select", text: "Nope" })).toEqual({ error: "no-option" })
    // A newer read invalidates every earlier reference.
    read(run)
    expect(run({ op: "act", readId, ref: ref("Hit"), how: "click" })).toEqual({ error: "stale" })
  })
  test("refuses to type into password fields or non-inputs", () => {
    const { run } = load(`<body><input type="password" aria-label="Pass"><button>Go</button></body>`)
    const { readId, result } = read(run)
    const ref = (name) => result.outline.find((entry) => entry.name === name).ref
    expect(run({ op: "act", readId, ref: ref("Pass"), how: "type", text: "x" })).toEqual({ error: "not-typable" })
    expect(run({ op: "act", readId, ref: ref("Go"), how: "type", text: "x" })).toEqual({ error: "not-typable" })
  })
  test("waits for text and times out", async () => {
    const { window, run } = load(`<body><p>loading</p></body>`)
    setTimeout(() => (window.document.body.innerHTML = "<p>done</p>"), 50)
    expect(await run({ op: "wait", waitText: "done", timeoutMs: 1000 })).toEqual({ found: true })
    expect(await run({ op: "wait", waitText: "never", timeoutMs: 150 })).toEqual({ found: false })
  })
  test("validates requests before anything reaches the page", () => {
    const base = { readId: randomUUID(), ref: "e1", how: "click" }
    expect(() => page.validate({ operation: "act", ...base, how: "eval" })).toThrow()
    expect(() => page.validate({ operation: "act", ...base, ref: "#login" })).toThrow()
    expect(() => page.validate({ operation: "act", ...base, how: "type" })).toThrow()
    expect(() => page.validate({ operation: "wait", waitText: "x", timeoutMs: 999999 })).toThrow()
    expect(page.validate({ operation: "act", ...base })).toMatchObject({ how: "click" })
  })
  test("trims the outline until the output fits", () => {
    const outline = Array.from({ length: 150 }, (_, i) => ({ ref: `e${i + 1}`, kind: "link", name: "x".repeat(80), href: "y".repeat(160) + "z".repeat(300) }))
    const fitted = page.fit({ readId: "r", title: "t", text: "a".repeat(8000), outline })
    expect(Buffer.byteLength(JSON.stringify(fitted))).toBeLessThanOrEqual(60000)
    expect(fitted.text.length).toBe(8000)
  })
})
