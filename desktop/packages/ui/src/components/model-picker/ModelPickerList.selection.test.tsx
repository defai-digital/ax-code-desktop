import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import type { ProviderWithModelList } from "@/types/providerModels"
import { ModelPickerList } from "./ModelPickerList"

const providers = [
  {
    id: "provider-a",
    models: [{ id: "model-a", name: "Model A" }],
  },
  {
    id: "provider-b",
    models: [{ id: "model-b", name: "Model B" }],
  },
] as unknown as ProviderWithModelList[]

// Stable identities, as the real call site has: these come from stores or memos, and a fresh literal
// per render would mean the list genuinely changed.
const noFavorites: never[] = []
const noRecents: never[] = []
const noMetadata = new Map()
// `hiddenModels` defaults to a fresh literal, which would rebuild the flat list on every render.
const noHidden: never[] = []

const labels = {
  searchPlaceholder: "Search",
  noResults: "No models",
  favorites: "Favorites",
  recent: "Recent",
  keyboardHint: "Hint",
}

describe("ModelPickerList selection", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.restoreAllMocks()
  })

  // The call site passes an inline `onActiveEntryChange`, so its identity changes on every parent
  // re-render — including the ones a thinking-variant key or a window resize cause. The reset belongs
  // to a change of the list, and firing it there jumped the highlight back to the first row: the next
  // Enter selected the first model instead of the one the user had navigated to.
  const render = (onSelect: (entry: unknown) => void) => {
    act(() => {
      root.render(
        <ModelPickerList
          providers={providers}
          favoriteModels={noFavorites}
          recentModels={noRecents}
          searchQuery=""
          modelsMetadata={noMetadata}
          hiddenModels={noHidden}
          onSearchQueryChange={() => {}}
          onSelect={onSelect}
          labels={labels}
          onActiveEntryChange={() => {}}
        />,
      )
    })
  }

  const pressKey = async (key: string) => {
    const input = container.querySelector<HTMLInputElement>('input[type="text"]')
    if (!input) throw new Error("search input not found")
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }))
    })
  }

  test("keeps the highlighted row across a re-render that only changes the callback identity", async () => {
    const onSelect = vi.fn()
    render(onSelect)

    await pressKey("ArrowDown")
    // A parent re-render: same list, new inline callback.
    render(onSelect)
    await pressKey("Enter")

    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect.mock.calls[0][0]).toMatchObject({ modelID: "model-b" })
  })
})
