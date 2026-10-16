import React, { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, describe, expect, test, vi } from "vitest"
import { I18nProvider } from "@/lib/i18n"

const { JsonTreeView } = await import("./JsonTreeView")

describe("JsonTreeView", () => {
  const roots: Array<ReturnType<typeof createRoot>> = []

  afterEach(() => {
    for (const root of roots.splice(0)) {
      act(() => root.unmount())
    }
    vi.restoreAllMocks()
  })

  const render = (jsonString: string) => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = createRoot(container)
    roots.push(root)

    act(() => {
      root.render(
        <I18nProvider>
          <JsonTreeView jsonString={jsonString} />
        </I18nProvider>,
      )
    })

    return container
  }

  test("renders a document whose top-level value is null", () => {
    // `null` is valid JSON and parses to null, which the guard read as a parse failure: the
    // pane came up completely blank for a file that is perfectly readable.
    const container = render("null")

    expect(container.textContent?.trim()).not.toBe("")
  })

  test("still reports an empty document instead of rendering nothing", () => {
    const container = render("   ")

    expect(container.textContent?.trim()).not.toBe("")
  })
})
