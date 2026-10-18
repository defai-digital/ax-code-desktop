import { describe, expect, test, vi } from "vitest"
import {
  createMarkdownWorkerParser,
  createMarkdownWorkerResponder,
  parseMarkdownInWorker,
} from "./markdownWorkerParser"
import type { MarkdownParseRequest } from "./markdownWorkerProtocol"

const request = (text: string, overrides: Partial<MarkdownParseRequest> = {}): MarkdownParseRequest => ({
  id: 1,
  text,
  live: true,
  baseKey: "test",
  ...overrides,
})

describe("worker response transfer", () => {
  test("sends only the changed suffix against an acknowledged live revision", () => {
    const respond = createMarkdownWorkerResponder()
    const first = respond(request("# Heading\n\nStable **body**\n\nTail", { id: 1, ownerId: 1 }))
    const input = request("# Heading\n\nStable **body**\n\nTail grows", { id: 2, ownerId: 1, baseRevision: 1 })
    const next = respond(input)
    expect(next.stablePrefixCount).toBe(2)
    expect(next.blocks).toHaveLength(1)
    expect([...first.blocks!.slice(0, next.stablePrefixCount), ...next.blocks!]).toEqual(parseMarkdownInWorker(input))
  })

  test.each([
    { id: 2, ownerId: 2, baseRevision: 1 },
    { id: 2, ownerId: 1, baseRevision: 0 },
    { id: 2, ownerId: 1, baseRevision: 1, live: false },
  ])("sends a full response for owner, revision, and finalization changes", (overrides) => {
    const respond = createMarkdownWorkerResponder()
    const text = "# Heading\n\nStable body\n\nTail"
    respond(request(text, { id: 1, ownerId: 1 }))
    const input = request(text + " grows", overrides)
    const next = respond(input)
    expect(next.stablePrefixCount ?? 0).toBe(0)
    expect(next.blocks).toEqual(parseMarkdownInWorker(input))
  })

  test("a late reference definition invalidates the completed prefix", () => {
    const respond = createMarkdownWorkerResponder()
    const text = "# Heading\n\n[reference] text\n\nTail\n\n"
    respond(request(text, { id: 1, ownerId: 1 }))
    const input = request(text + "[reference]: https://example.com", { id: 2, ownerId: 1, baseRevision: 1 })
    const next = respond(input)
    expect(next.stablePrefixCount ?? 0).toBe(0)
    expect(next.blocks).toEqual(parseMarkdownInWorker(input))
  })
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
