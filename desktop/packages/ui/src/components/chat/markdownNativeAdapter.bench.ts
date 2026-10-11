/** Experimental AST bridge. Imported by benchmarks only, never by the app. */
import type { Root } from "mdast"

type NativeNode = {
  type: string
  value?: string
  children?: NativeNode[]
  data?: Record<string, unknown>
  position?: { start: Point; end: Point }
}
type Point = { line: number; column: number; offset: number }

export function adaptNativeMarkdown(tree: Root, source: string): Root {
  const byteOffsets = new Uint32Array(new TextEncoder().encode(source).length + 1)
  const lineStarts = [0]
  let byte = 0
  for (let offset = 0; offset < source.length; ) {
    const code = source.codePointAt(offset)!
    const width = code > 0xffff ? 2 : 1
    const bytes = code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4
    for (let index = 0; index < bytes; index++) byteOffsets[byte++] = offset
    if (source[offset] === "\n" || (source[offset] === "\r" && source[offset + 1] !== "\n")) lineStarts.push(offset + 1)
    offset += width
  }
  byteOffsets[byte] = source.length
  const points = new Map<number, Point>()
  const point = (offset: number): Point => {
    const existing = points.get(offset)
    if (existing) return { ...existing }
    let low = 0,
      high = lineStarts.length
    while (low + 1 < high) {
      const middle = (low + high) >>> 1
      if (lineStarts[middle] <= offset) low = middle
      else high = middle
    }
    const result = { offset, line: low + 1, column: offset - lineStarts[low] + 1 }
    points.set(offset, result)
    return { ...result }
  }
  const visit = (node: NativeNode) => {
    if (node.position) {
      let startOffset = byteOffsets[node.position.start.offset]
      if (node.type === "text" && source[startOffset - 1] === "\\" && /[!-/:-@[-`{-~]/.test(source[startOffset]))
        startOffset--
      const start = point(startOffset)
      let end = byteOffsets[node.position.end.offset]
      // markdown-rs includes a final line ending in list container spans.
      // Match remark's last-content boundary without changing child positions.
      if (node.type === "list" || node.type === "listItem" || node.type === "footnoteDefinition") {
        while (end > start.offset && /[\r\n]/.test(source[end - 1])) end--
      }
      node.position = { start, end: point(end) }
    }
    if (node.type === "inlineMath") {
      if (/[\r\n]/.test(node.value ?? "")) {
        let value = (node.value ?? "").replace(/\r\n|\r|\n/g, " ")
        const span = source.slice(node.position?.start.offset, node.position?.end.offset)
        const size = span.match(/^\$+/)?.[0].length ?? 0
        const alreadyTrimmed = span[size] === " " && span[span.length - size - 1] === " "
        if (!alreadyTrimmed && value.startsWith(" ") && value.endsWith(" ") && /[^ ]/.test(value))
          value = value.slice(1, -1)
        node.value = value
      }
      node.data = {
        hName: "code",
        hProperties: { className: ["language-math", "math-inline"] },
        hChildren: [{ type: "text", value: node.value ?? "" }],
      }
    } else if (node.type === "math") {
      node.data = {
        hName: "pre",
        hChildren: [
          {
            type: "element",
            tagName: "code",
            properties: { className: ["language-math", "math-display"] },
            children: [{ type: "text", value: node.value ?? "" }],
          },
        ],
      }
    }
    node.children?.forEach(visit)
  }
  visit(tree as NativeNode)
  return tree
}
