import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, test } from "vitest"
import type { Root } from "mdast"
import { adaptNativeMarkdown } from "./markdownNativeAdapter.bench"
import { parseMarkdownInWorker } from "./markdownWorkerParser"
import { PreparedMarkdown } from "./PreparedMarkdown"
import { buildFullMarkdownBlock } from "./markdownStreamBlocks"

// Captured directly from the locked Rust parser. CI does not need Cargo or a
// native binary to verify the experimental bridge's semantic and position parity.
const fixtures = JSON.parse(
  readFileSync(
    resolve(import.meta.dirname, "../../../../../../.internal/experiments/markdown-rust/compatibility-fixtures.json"),
    "utf8",
  ),
) as { text: string; tree: Root }[]
const normalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(normalize)
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry != null)
        .map(([key, entry]) => [key, normalize(entry)]),
    )
  return value
}
describe("Experimental native Markdown AST bridge", () => {
  test.each(fixtures)("preserves positions, math metadata and markup: $text", ({ text, tree }) => {
    const expected = parseMarkdownInWorker({ id: 1, text, live: false, baseKey: "fixture" })[0]
    const actual = {
      ...buildFullMarkdownBlock(text, "fixture"),
      tree: adaptNativeMarkdown(structuredClone(tree), text),
    }
    expect(normalize(actual.tree)).toEqual(normalize(expected.tree))
    const expectedHtml = renderToStaticMarkup(<PreparedMarkdown block={expected} components={{}} />)
    expect(renderToStaticMarkup(<PreparedMarkdown block={actual} components={{}} />)).toBe(expectedHtml)
  })
})
