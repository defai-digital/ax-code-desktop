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

  const render = (jsonString: string, format?: "json" | "jsonc") => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = createRoot(container)
    roots.push(root)

    act(() => {
      root.render(
        <I18nProvider>
          <JsonTreeView jsonString={jsonString} format={format} />
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

  test("renders a .jsonc document's comments and trailing commas in jsonc mode", () => {
    // A `.jsonc` file is a JSON file with comments and trailing commas; parsing it as strict JSON
    // reported a perfectly readable file as invalid.
    const container = render('{\n  // why\n  "unicorn": "cake",\n}', "jsonc")

    expect(container.textContent).toContain("unicorn")
    expect(container.textContent).not.toContain("Invalid JSON")
  })

  test("still reports the same document as invalid in json mode", () => {
    const container = render('{\n  // why\n  "unicorn": "cake",\n}')

    expect(container.textContent).toContain("Invalid JSON")
  })

  test("still reports an empty document instead of rendering nothing", () => {
    const container = render("   ")

    expect(container.textContent?.trim()).not.toBe("")
  })

  test("does not carry one document's collapsed nodes into the next", () => {
    // The collapsed set holds node ids, and those ids are paths: FilesView renders this view for
    // another file without remounting it, so the previous document's collapsed paths were applied
    // to the new one — a shared path left it collapsed to that row, and a disjoint one left it
    // fully expanded instead of stopping at the initial depth.
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = createRoot(container)
    roots.push(root)

    const show = (jsonString: string) =>
      act(() => {
        root.render(
          <I18nProvider>
            <JsonTreeView jsonString={jsonString} />
          </I18nProvider>,
        )
      })

    // Rows whose value can be folded carry a toggle; the toolbar's two buttons have labels.
    const rowToggles = () =>
      Array.from(container.querySelectorAll("button")).filter((button) => !button.textContent?.trim()).length

    // The document row and its `root` property are open; `a` is at the initial depth and folds,
    // hiding `deep` and `deeper`.
    show('{"root":{"a":{"deep":{"deeper":1}}}}')
    expect(rowToggles()).toBe(3)

    // B shares no path with A, so it folds at its own initial depth: the same shape, three rows.
    // With A's paths carried over (`root.a`, `root.a.deep`) nothing matches and B renders every
    // row — four toggles.
    show('{"root":{"x":{"y":{"z":1}}}}')
    expect(rowToggles()).toBe(3)
  })
})
