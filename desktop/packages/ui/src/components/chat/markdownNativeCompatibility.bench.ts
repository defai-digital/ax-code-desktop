/** Native AST compatibility audit. Run after building the locked Rust experiment. */
import { spawn } from "node:child_process"
import { once } from "node:events"
import { createInterface } from "node:readline"
import { fileURLToPath } from "node:url"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { isDeepStrictEqual } from "node:util"
import assert from "node:assert/strict"
import { unified } from "unified"
import remarkParse from "remark-parse"
import remarkGfm from "remark-gfm"
import remarkMath from "remark-math"
import type { Root } from "mdast"
import { PreparedMarkdown } from "./PreparedMarkdown"
import { adaptNativeMarkdown } from "./markdownNativeAdapter.bench"
import { buildFullMarkdownBlock } from "./markdownStreamBlocks"

const texts = [
  "# Hello\n\nA **bold** [link](https://example.com).",
  "| a | b |\n| - | - |\n| 1 | 2 |\n\n- [x] done\n- [ ] pending\n\n~strike~ ~~strike~~ https://example.com\n\nInline $x^2$ and $$y$$.\n\n$$\nx^2\n$$\n\nNote[^a].\n\n[^a]: Footnote",
  "繁體中文 😀 &amp; &#x1F600; &unknown;\n\n[中文](./路徑.ts)\n\n```ts\nconst x = '😀'\n```",
  "# 中文 😀\r\n\r\n中文 *😀* $α$\r\n\r\n$$\r\nx+1\r\n$$\r\n",
  "# 中文 😀\r\r中文 *😀* $α$\r\r$$\rx+1\r$$\r",
  "- first\n- second\n\nAfter",
  "- first  \n- second  \n\nAfter",
  "- first\n\n- second\n\nAfter",
  "- parent\n  - 中文 😀\n  - second\n\nAfter",
  "1. 中文\n2. 😀\n\nAfter",
  "- [x] 中文 😀\n- [ ] next\n",
  "> 中文 😀\n>\n> - item\n> - second\n\nAfter",
  '[one][A]\n\n[A]: ./file.ts "title"\n\nFootnote[^中文].\n\n[^中文]: 😀',
  "Inline $x$ $$x$$ $$$x$$$ and $ x $ and $\n x\n$.\n\n$$ meta\nx+1\n$$",
  "<script>alert(1)</script>\n\n[x](javascript:alert) [x](file:///tmp/x)",
  "```mermaid\ngraph TD; A-->B\n```\n\n~~~ts title\nconst x = 1\n~~~",
  "| 中文 | 😀 |\n| :--- | ---: |\n| a\\|b | `x` |",
  "a &NotEqualTilde; &#x1f600; &copy; &unknown; b\\*c",
  "www.example.com/a 中文 https://example.com/😀 mail@example.com",
  "**bold** *emphasis* ~~deleted~~ ~deleted~ __bold__ _emphasis_",
  "## heading ###\n\nheading\n===\n\n---\n\n    indented 😀\n",
  "-\n- \n- [ ]\n\nAfter",
  "A[^1] and again[^1].\n\n[^1]: first\n\n    second paragraph\n\nAfter",
  "\\$literal\\$ $\\frac{1}{2}$\n\n$$\n\\begin{matrix}1&2\\end{matrix}\n$$",
  '![image](https://example.com/image.png "title")\n\n![image][ref]\n\n[ref]: ./中文.png',
]
const parser = unified().use(remarkParse).use(remarkGfm).use(remarkMath)
const executable = fileURLToPath(
  new URL(
    "../../../../../../.internal/experiments/markdown-rust/target/release/ax-coder-markdown-bench",
    import.meta.url,
  ),
)
const child = spawn(executable, [], { stdio: ["pipe", "pipe", "inherit"] })
const lines = createInterface({ input: child.stdout })[Symbol.asyncIterator]()
const normalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(normalize)
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v != null)
        .map(([k, v]) => [k, normalize(v)]),
    )
  return value
}
try {
  await once(child, "spawn")
  const results = []
  for (const [index, text] of texts.entries()) {
    child.stdin.write(`${JSON.stringify({ sources: [text] })}\n`)
    const line = await lines.next()
    if (line.done) throw new Error("Native audit exited early")
    const tree = (JSON.parse(line.value) as { trees: Root[] }).trees[0]
    const adapted = adaptNativeMarkdown(structuredClone(tree), text)
    const expected = parser.parse(text)
    const render = (root: Root) =>
      renderToStaticMarkup(
        createElement(PreparedMarkdown, {
          block: { ...buildFullMarkdownBlock(text, "audit"), tree: root },
          components: {},
        }),
      )
    const result = {
      index,
      text,
      tree,
      astEqual: isDeepStrictEqual(normalize(adapted), normalize(expected)),
      renderedEqual: render(adapted) === render(expected),
    }
    results.push(result)
    if (!result.astEqual) {
      try {
        assert.deepEqual(normalize(adapted), normalize(expected))
      } catch (error) {
        console.error(String(error).slice(0, 3200))
      }
    }
    console.error(
      JSON.stringify({
        index,
        astEqual: result.astEqual,
        renderedEqual: result.renderedEqual,
        text: text.slice(0, 55),
      }),
    )
  }
  console.log(JSON.stringify(results, null, 2))
} finally {
  child.stdin.end()
  child.kill()
  await lines.return?.()
}
