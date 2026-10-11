import { act } from "react"
import { createRoot } from "react-dom/client"
import { expect, test, vi } from "vitest"
import { JsonTreeViewer } from "./JsonTreeViewer"

const state = vi.hoisted(() => ({ index: 0, notify: () => {} }))
vi.mock("@tanstack/react-virtual", async () => {
  const React = await import("react")
  const instance = {
    getTotalSize: () => 9000,
    getVirtualItems: () => [{ index: state.index, size: 22, start: state.index * 22 }],
  }
  return { useVirtualizer: () => {
    const [, update] = React.useReducer((value: number) => value + 1, 0)
    state.notify = update
    return instance
  } }
})

test("replaces visible JSON rows on a stable virtualizer instance", () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)
  try {
    act(() => root.render(<JsonTreeViewer data={Array.from({ length: 400 }, (_, i) => `value-${i}`)} />))
    expect(container.querySelectorAll("[data-json-tree-row]")).toHaveLength(1)
    expect(container.querySelector('[data-json-tree-row="0"]')).not.toBeNull()
    act(() => { state.index = 400; state.notify() })
    expect(container.textContent).toContain("value-399")
    expect(container.querySelector('[data-json-tree-row="0"]')).toBeNull()
    expect(container.querySelectorAll("[data-json-tree-row]")).toHaveLength(1)
  } finally {
    act(() => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
  }
})
