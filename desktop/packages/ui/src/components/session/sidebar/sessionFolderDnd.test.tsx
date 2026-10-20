import React, { act } from "react"
import { createRoot } from "react-dom/client"
import { expect, test, vi } from "vitest"
import { createDesktopUiTools } from "@/lib/desktopUiWebMcp"
import { DraggableSessionRow, SessionFolderDndScope } from "./sessionFolderDnd"

test("WebMCP exposes the working session action without an inert duplicate drag button", () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const rects = vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue([{}] as unknown as DOMRectList)
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)
  const open = vi.fn()
  try {
    act(() => root.render(
      <SessionFolderDndScope scopeKey="/work" hasFolders={false} onSessionDroppedOnFolder={vi.fn()}>
        <DraggableSessionRow sessionId="session-a" sessionDirectory="/work" sessionTitle="Review">
          <button onClick={open}>Review · Project A</button>
        </DraggableSessionRow>
      </SessionFolderDndScope>,
    ))
    const { tools, dispose } = createDesktopUiTools(document)
    try {
      const state = tools[0].execute({}) as { controls: Array<{ ref: string; name: string }> }
      const actions = state.controls.filter(control => control.name === "Review · Project A")
      expect(actions).toHaveLength(1)
      act(() => { tools[1].execute({ ref: actions[0].ref }) })
      expect(open).toHaveBeenCalledOnce()
      expect(document.activeElement).toBe(container.querySelector("button"))
    } finally {
      dispose()
    }
  } finally {
    act(() => root.unmount())
    container.remove()
    rects.mockRestore()
  }
})
