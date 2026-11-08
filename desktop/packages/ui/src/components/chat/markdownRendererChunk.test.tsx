import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, test, vi } from "vitest"

const evaluated = vi.hoisted(() => ({ count: 0 }))

vi.mock("./MarkdownRendererImpl", () => {
  evaluated.count += 1
  return {
    MarkdownRenderer: () => <p>full markdown</p>,
    SimpleMarkdownRenderer: () => <p>simple markdown</p>,
  }
})

import { MarkdownRenderer, SimpleMarkdownRenderer } from "./MarkdownRenderer"
import { loadMarkdownRendererModule, preloadMarkdownRenderer } from "./markdownRendererChunk"

let root: Root | null = null
let container: HTMLDivElement | null = null

const renderSync = (element: React.ReactNode): HTMLDivElement => {
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  // Synchronous act: a lazy component that suspends would still show its fallback here.
  act(() => root?.render(element))
  return container
}

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
})

describe("Markdown renderer chunk", () => {
  test("after preloading, the first render shows content without suspending", async () => {
    preloadMarkdownRenderer()
    preloadMarkdownRenderer()
    await loadMarkdownRendererModule()
    expect(evaluated.count).toBe(1)

    // First-ever render of the lazy component: content must be in the initial commit, not
    // behind a Suspense fallback that React would reveal up to 300 ms later.
    const view = renderSync(<MarkdownRenderer {...({} as React.ComponentProps<typeof MarkdownRenderer>)} />)
    expect(view.textContent).toBe("full markdown")
  })

  test("the simple renderer export resolves from the same loaded module", () => {
    const view = renderSync(
      <SimpleMarkdownRenderer {...({} as React.ComponentProps<typeof SimpleMarkdownRenderer>)} />,
    )
    expect(view.textContent).toBe("simple markdown")
    expect(evaluated.count).toBe(1)
  })
})
