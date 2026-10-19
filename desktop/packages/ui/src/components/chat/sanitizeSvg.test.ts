import { describe, expect, test } from "vitest"
import { renderMermaidSVG } from "beautiful-mermaid"

import { sanitizeMermaidSvg } from "./sanitizeSvg"

// Parse as DOM and check for active content, since escaped payload text
// (e.g. "&lt;img src=x onerror=...&gt;" as visible label text) is inert.
// text/html matches the dangerouslySetInnerHTML injection context.
const expectNoActiveContent = (svg: string) => {
  expect(svg).not.toMatch(/<script/i)
  expect(svg).not.toMatch(/javascript:/i)
  const doc = new DOMParser().parseFromString(svg, "text/html")
  for (const element of Array.from(doc.querySelectorAll("*"))) {
    for (const attribute of Array.from(element.attributes)) {
      expect(attribute.name.toLowerCase().startsWith("on")).toBe(false)
      expect(attribute.value).not.toMatch(/javascript:/i)
    }
  }
}

describe("sanitizeMermaidSvg", () => {
  test("keeps benign SVG structure intact", () => {
    const benign = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" /></svg>'
    const sanitized = sanitizeMermaidSvg(benign)
    expect(sanitized).toContain("<svg")
    expect(sanitized).toContain("<rect")
  })

  test("strips event handler attributes from hostile SVG", () => {
    const hostile = '<svg xmlns="http://www.w3.org/2000/svg"><image href="x" onerror="alert(1)" /></svg>'
    const sanitized = sanitizeMermaidSvg(hostile)
    expect(sanitized).not.toContain("onerror")
    expect(sanitized).toContain("<svg")
  })

  test("strips script elements from hostile SVG", () => {
    const hostile = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><rect /></svg>'
    const sanitized = sanitizeMermaidSvg(hostile)
    expect(sanitized).not.toMatch(/<script/i)
    expect(sanitized).not.toContain("alert(1)")
  })

  test("strips javascript: URLs from hostile SVG links", () => {
    const hostile = '<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:alert(1)"><text>click</text></a></svg>'
    const sanitized = sanitizeMermaidSvg(hostile)
    expect(sanitized).not.toMatch(/javascript:/i)
    expect(sanitized).toContain("click")
  })

  test("sanitizes SVG rendered from a malicious mermaid diagram", () => {
    const maliciousSources = [
      'flowchart LR\n  A["<img src=x onerror=alert(1)>"] --> B',
      'flowchart LR\n  A["<script>alert(1)</script>"] --> B',
      'flowchart LR\n  A["x"] --> B\n  click A href "javascript:alert(1)"',
    ]
    for (const source of maliciousSources) {
      const sanitized = sanitizeMermaidSvg(renderMermaidSVG(source, {}))
      expect(sanitized).toContain("<svg")
      expectNoActiveContent(sanitized)
    }
  })

  test("removes external resources and embedded HTML while preserving local markers", () => {
    const svg = sanitizeMermaidSvg(`<svg xmlns="http://www.w3.org/2000/svg">
      <style>.remote { fill: url(https://example.com/a.svg); } .local { marker-end: url(#arrow); }</style>
      <image href="https://example.com/image.png" />
      <foreignObject><div>HTML</div></foreignObject>
      <use href="https://example.com/sprite.svg#node" />
      <path marker-end="url(#arrow)" />
    </svg>`)
    expect(svg).not.toMatch(/https:|foreignObject|<image/)
    expect(svg).toContain("url(#arrow)")
  })

  test("rejects escaped CSS resource names", () => {
    const svg = sanitizeMermaidSvg(String.raw`<svg><style>.x { fill: u\72l(https://example.com/a); }</style></svg>`)
    expect(svg).not.toContain("https:")
  })

  test("replaces percentage SVG dimensions with intrinsic viewBox dimensions", () => {
    const svg = sanitizeMermaidSvg('<svg width="100%" viewBox="0 0 560 450"><text>Chart</text></svg>')
    const document = new DOMParser().parseFromString(svg, "image/svg+xml")
    expect(document.documentElement.getAttribute("width")).toBe("560")
    expect(document.documentElement.getAttribute("height")).toBe("450")
  })

  test("preserves themed text styles and keyframes while removing external stylesheet rules", () => {
    const svg = sanitizeMermaidSvg(
      '<svg><style>@import url(https://example.com/style.css); @keyframes dash { to { stroke-dashoffset: 0; } } .label { fill: #eee; }</style><text class="label">Title</text></svg>',
    )
    expect(svg).not.toContain("https:")
    expect(svg).toContain("fill: #eee")
    expect(svg).toContain("@keyframes dash")
  })
})

test("does not reassemble a stylesheet import while removing malformed CSS", () => {
  const svg = sanitizeMermaidSvg('<svg><style>@imp@import "x";ort "https://example.com/style.css";</style></svg>')
  expect(svg).not.toMatch(/@import\s+["']/i)
})
