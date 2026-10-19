import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { LazySyntaxHighlighter } from "./LazySyntaxHighlighter"

// Code, diffs, terminal output, file paths and Mermaid source stay left to right whatever the interface direction
// (SPEC-2026-10-19-desktop-localization-v2 section 3).
describe("code surfaces keep left-to-right direction", () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    document.documentElement.dir = "rtl"
    host = document.createElement("div")
    document.body.append(host)
    root = createRoot(host)
  })
  afterEach(async () => {
    await act(async () => root.render(null))
    host.remove()
    document.documentElement.dir = ""
  })

  test("the syntax highlighter pins its pre tag, before and after the highlighter loads", async () => {
    act(() => root.render(<LazySyntaxHighlighter language="ts">{"const a = 1"}</LazySyntaxHighlighter>))
    const fallback = host.querySelector("pre")
    expect(fallback?.querySelector("span.token")).toBeNull()
    expect(fallback?.getAttribute("dir")).toBe("ltr")

    await vi.waitFor(
      async () => {
        await act(async () => {})
        expect(host.querySelector("pre span.token")).not.toBeNull()
      },
      { timeout: 5000 },
    )
    const pre = host.querySelector("pre")
    expect(pre?.getAttribute("dir")).toBe("ltr")
    expect(pre?.textContent).toContain("const a = 1")
  })
})
