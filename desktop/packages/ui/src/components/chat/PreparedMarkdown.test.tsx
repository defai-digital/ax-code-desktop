import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, test } from "vitest"
import { PreparedMarkdown } from "./PreparedMarkdown"
import { parseMarkdownInWorker } from "./markdownWorkerParser"
import { buildFullMarkdownBlock } from "./markdownStreamBlocks"

describe("Worker Markdown rendering parity", () => {
  test.each([
    "Entities &amp; &copy; &NotEqualTilde; &#x1f600; and &unknown;.",
    "# Header\n\n**strong** *emphasis* ~~deleted~~ [link](https://example.com) www.example.com",
    "| A | B |\n|---|---|\n| one | two |\n\n- [x] done\n- [ ] pending",
    "A footnote[^1].\n\n[^1]: Note with **formatting**.",
    "Inline $x^2$ math.\n\n$$\nx+1\n$$",
    "```typescript\nconst value = 42\n```\n\n```mermaid\ngraph TD; A-->B\n```",
    "[bad](javascript:alert%281%29) <script>alert(1)</script> ![image](https://example.com/image.png)",
  ])("preserves the normal ReactMarkdown output: %s", (text) => {
    const block = parseMarkdownInWorker({ id: 1, text, baseKey: "test", live: false })[0]
    const components = {
      code: ({ children }: { children?: React.ReactNode }) => <code data-custom="code">{children}</code>,
    }
    const expected = renderToStaticMarkup(
      <PreparedMarkdown block={buildFullMarkdownBlock(text, "test")} components={components} />,
    )
    const actual = renderToStaticMarkup(<PreparedMarkdown block={block} components={components} />)
    expect(actual).toBe(expected)
    // Reusing a result must not corrupt footnotes or other processor state.
    expect(renderToStaticMarkup(<PreparedMarkdown block={block} components={components} />)).toBe(expected)
  })

  test("uses the prepared tree instead of parsing the supplied source again", () => {
    const block = parseMarkdownInWorker({ id: 1, text: "**prepared**", baseKey: "test", live: false })[0]
    const html = renderToStaticMarkup(<PreparedMarkdown block={{ ...block, src: "wrong source" }} components={{}} />)
    expect(html).toContain("<strong>prepared</strong>")
    expect(html).not.toContain("wrong source")
  })

  test("keeps unsafe HTML inert in the complete plain-text fallback", () => {
    const text = '<img src=x onerror="alert(1)"> **full text**'
    const html = renderToStaticMarkup(
      <PreparedMarkdown block={{ ...buildFullMarkdownBlock(text, "test"), plain: true }} components={{}} />,
    )
    expect(html).toContain("&lt;img")
    expect(html).toContain("**full text**")
    expect(html).not.toContain("<img")
  })
})

describe("malformed markdown fallback", () => {
  test("renders pathologically nested markdown as plain text instead of crashing the chat", async () => {
    const React = await import("react")
    const { createRoot } = await import("react-dom/client")
    globalThis.IS_REACT_ACT_ENVIRONMENT = true

    // Deep nesting overflows remark during render; the boundary must catch it.
    const text = "> ".repeat(6000) + "deep"
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = createRoot(container)

    React.act(() => {
      root.render(<PreparedMarkdown block={buildFullMarkdownBlock(text, "test")} components={{}} />)
    })

    expect(container.textContent).toContain("deep")

    React.act(() => root.unmount())
    container.remove()
  })
})

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}
