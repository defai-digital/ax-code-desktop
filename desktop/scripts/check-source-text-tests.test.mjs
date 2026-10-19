import path from "node:path"
import { describe, expect, test } from "vitest"
import { compareWithBaseline, findReadSourceFiles, scanSourceTextTests } from "./check-source-text-tests.mjs"

const testPath = "/repo/ui/src/components/Widget.test.ts"
const existing = new Set(["/repo/ui/src/components/Widget.tsx", "/repo/ui/src/index.css"])
const exists = (file) => existing.has(file)

describe("findReadSourceFiles", () => {
  test("flags a test that reads an existing sibling source file", () => {
    const text = 'const source = readFileSync(new URL("./Widget.tsx", import.meta.url), "utf8")'
    expect(findReadSourceFiles(testPath, text, exists)).toEqual(["/repo/ui/src/components/Widget.tsx"])
    const css = 'const css = await readFile(path.join(__dirname, "../index.css"), "utf8")'
    expect(findReadSourceFiles(testPath, css, exists)).toEqual(["/repo/ui/src/index.css"])
  })

  test("ignores tests that do not read files, fixture paths and missing files", () => {
    expect(findReadSourceFiles(testPath, 'import { Widget } from "./Widget.tsx"', exists)).toEqual([])
    const fixtures = 'readFileSync(tmp); const p = "/repo/src/app.ts"; const q = "plugin.ts"'
    expect(findReadSourceFiles(testPath, fixtures, exists)).toEqual([])
    expect(findReadSourceFiles(testPath, 'readFileSync("./Widget.test.ts")', () => true)).toEqual([])
  })
})

describe("compareWithBaseline", () => {
  test("reports new offenders and stale baseline entries", () => {
    expect(compareWithBaseline(["a", "b"], ["a", "c"])).toEqual({ added: ["b"], stale: ["c"] })
    expect(compareWithBaseline(["a"], ["a"])).toEqual({ added: [], stale: [] })
  })
})

describe("repository scan", () => {
  test("the committed baseline matches the repository", async () => {
    const { default: baseline } = await import("./source-text-tests-baseline.json", { with: { type: "json" } })
    const desktopRoot = path.resolve(import.meta.dirname, "..")
    expect(compareWithBaseline(scanSourceTextTests({ root: desktopRoot }), baseline)).toEqual({ added: [], stale: [] })
  })
})
