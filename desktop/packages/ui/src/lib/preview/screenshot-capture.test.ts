import { describe, expect, test, vi } from "vitest"

import {
  formatPreviewAnnotationMarkdown,
  isElementNode,
  isPreviewElementMetadata,
  renderPreviewScreenshot,
  type PreviewElementMetadata,
} from "./screenshot-capture"

const createMetadata = (overrides: Partial<PreviewElementMetadata> = {}): PreviewElementMetadata => ({
  frame: "top",
  tag: "button",
  text: "Save",
  selector: "button.save",
  path: "html > body > button.save",
  bounds: { x: 10, y: 20, width: 80, height: 32 },
  center: { x: 50, y: 36 },
  attributes: { type: "button" },
  computedStyle: {
    display: "inline-flex",
    position: "static",
    fontWeight: "600",
    fontSize: "14px",
    lineHeight: "20px",
    fontFamily: "Inter",
    color: "rgb(0, 0, 0)",
    backgroundColor: "rgb(255, 255, 255)",
    zIndex: "auto",
  },
  ancestry: [
    {
      tag: "body",
      selectorPart: "body",
    },
    {
      tag: "button",
      className: "save",
      selectorPart: "button.save",
    },
  ],
  ...overrides,
})

describe("preview screenshot metadata", () => {
  test("accepts metadata that the annotation formatter can safely dereference", () => {
    const metadata = createMetadata()

    expect(isPreviewElementMetadata(metadata)).toBe(true)
    expect(
      formatPreviewAnnotationMarkdown({
        pageUrl: "http://localhost:3000/",
        viewport: { width: 1024, height: 768 },
        devicePixelRatio: 2,
        target: metadata,
        screenshotAttached: true,
        intro: "Inspect this element.",
      }),
    ).toContain("- Ancestry: body > button.save")
  })

  test("rejects malformed ancestry entries before the formatter can throw", () => {
    expect(
      isPreviewElementMetadata({
        ...createMetadata(),
        ancestry: [null],
      }),
    ).toBe(false)

    expect(
      isPreviewElementMetadata({
        ...createMetadata(),
        ancestry: [{ tag: "button" }],
      }),
    ).toBe(false)
  })
})

describe("renderPreviewScreenshot", () => {
  test("returns null instead of hanging when the desktop capture IPC stalls", async () => {
    vi.useFakeTimers()
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    ;(window as unknown as { __TAURI__?: unknown }).__TAURI__ = {
      core: { invoke: () => new Promise(() => {}) },
    }
    const iframe = {
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
    } as unknown as HTMLIFrameElement

    try {
      const pending = renderPreviewScreenshot(iframe, createMetadata())
      const assertion = expect(pending).resolves.toBeNull()
      await vi.advanceTimersByTimeAsync(10_000)
      await assertion
    } finally {
      warn.mockRestore()
      delete (window as unknown as { __TAURI__?: unknown }).__TAURI__
      vi.useRealTimers()
    }
  })
})

describe("isElementNode", () => {
  test("recognises an element built by another document", () => {
    // The nodes these run on come from an iframe's document or from snapDOM's clone document, so
    // `instanceof HTMLElement` (this module's constructor) was false for every one of them: the
    // nested-scroll bake never recognised snapDOM's wrapper and `document.scrollingElement` was never read.
    const iframe = document.createElement("iframe")
    document.body.appendChild(iframe)
    try {
      const foreignDocument = iframe.contentDocument
      const foreignElement = foreignDocument?.createElement("div")

      expect(foreignElement instanceof HTMLElement).toBe(false)
      expect(isElementNode(foreignElement)).toBe(true)
      expect(isElementNode(document.createElement("span"))).toBe(true)
      expect(isElementNode(document.createTextNode("x"))).toBe(false)
      expect(isElementNode(null)).toBe(false)
      expect(isElementNode(undefined)).toBe(false)
    } finally {
      iframe.remove()
    }
  })
})
