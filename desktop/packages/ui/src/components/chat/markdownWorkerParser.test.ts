import { describe, expect, test, vi } from "vitest"
import { createMarkdownWorkerParser, parseMarkdownInWorker } from "./markdownWorkerParser"
import type { MarkdownParseRequest } from "./markdownWorkerProtocol"

const request = (text: string, overrides: Partial<MarkdownParseRequest> = {}): MarkdownParseRequest => ({
  id: 1,
  text,
  live: true,
  baseKey: "test",
  ...overrides,
})

describe("Incremental worker Markdown parsing", () => {
  test("preserves UTF-16 source and CRLF when retaining completed blocks", () => {
    const parse = createMarkdownWorkerParser()
    const prefix = "# 中文 😀 \ud800\r\n\r\nBody \udc00\r\n\r\nTail"
    const initial = parse(request(prefix))
    const input = request(prefix + " appended")
    const next = parse(input)
    expect(next).toEqual(parseMarkdownInWorker(input))
    expect(next[0]).toBe(initial[0])
    expect(next[0].raw).toContain("\ud800")
  })
  test("matches stateless parsing while reusing completed ASTs", () => {
    const syntax = vi.fn((source: string) => parseMarkdownInWorker(request(source, { live: false }))[0].tree!)
    const parse = createMarkdownWorkerParser(syntax)
    const first = parse(request("# Header\n\n**complete**\n\nTail"))
    const calls = syntax.mock.calls.length
    const nextRequest = request("# Header\n\n**complete**\n\nTail grows")
    const next = parse(nextRequest)
    expect(next).toEqual(parseMarkdownInWorker(nextRequest))
    expect(next[0]).toBe(first[0])
    expect(next[1]).toBe(first[1])
    expect(next.at(-1)?.tree).not.toBe(first.at(-1)?.tree)
    expect(syntax.mock.calls.length - calls).toBe(1)
  })

  test.each([
    "[ref]: ./new.ts\n\nTail",
    "[^1]: footnote\n\nTail",
    "=====\n\nTail",
    "```\nconst x = 1\n```\n\nTail",
    "| a | b |\n| - | - |\n| 1 | 2 |\n\nTail",
    "$$\nx+1\n$$\n\nTail",
  ])("preserves parsing when appended syntax changes block interpretation: %s", (suffix) => {
    const parse = createMarkdownWorkerParser()
    const prefix = "Completed **paragraph**\n\n[ref] text\n\n"
    parse(request(prefix))
    for (let length = 1; length <= suffix.length; length++) {
      const input = request(prefix + suffix.slice(0, length))
      expect(parse(input)).toEqual(parseMarkdownInWorker(input))
    }
  })

  test("invalidates cross-message, rewrite, truncation and finalization reuse", () => {
    const parse = createMarkdownWorkerParser()
    const original = request("# One\n\nBody\n\nTail")
    let previous = parse(original)
    for (const input of [
      request(original.text + " grows", { baseKey: "other" }),
      request("# One\n\nChanged\n\nTail", { baseKey: "other" }),
      request("# One\n\nChanged", { baseKey: "other" }),
      request("# One\n\nChanged", { baseKey: "other", live: false }),
      original,
    ]) {
      const next = parse(input)
      expect(next).toEqual(parseMarkdownInWorker(input))
      expect(next[0].tree).not.toBe(previous[0].tree)
      previous = next
    }
  })
})
