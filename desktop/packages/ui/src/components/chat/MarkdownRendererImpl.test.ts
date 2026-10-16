import { describe, expect, test } from "vitest"

import { areMarkdownRendererPropsEqual } from "./markdownRendererMemo"
import { getSafeMarkdownHref } from "./markdownLinks"

describe("getSafeMarkdownHref", () => {
  test("preserves safe external markdown links", () => {
    expect(getSafeMarkdownHref("https://example.com/docs")).toBe("https://example.com/docs")
    expect(getSafeMarkdownHref("mailto:support@example.com")).toBe("mailto:support@example.com")
  })

  test("removes unsafe markdown hrefs before rendering anchors", () => {
    expect(getSafeMarkdownHref("javascript:alert(1)")).toBeUndefined()
    expect(getSafeMarkdownHref("file:///Users/test/secret.txt")).toBeUndefined()
    expect(getSafeMarkdownHref("https://user:pass@example.com/docs")).toBeUndefined()
    expect(getSafeMarkdownHref(undefined)).toBeUndefined()
  })
})

describe("areMarkdownRendererPropsEqual", () => {
  const props = (overrides: Record<string, unknown> = {}) => ({
    content: "text",
    messageId: "msg-1",
    ...overrides,
  })

  test("does not skip a re-render that enables file references", () => {
    // The comparator left this prop out, so a part finalized (stream over) with file references
    // enabled kept the dead links it had rendered while streaming.
    expect(areMarkdownRendererPropsEqual(props({ enableFileReferences: false }), props({ enableFileReferences: true }))).toBe(false)
  })

  test("skips a re-render when nothing it renders from changed", () => {
    expect(areMarkdownRendererPropsEqual(props(), props())).toBe(true)
  })
})
