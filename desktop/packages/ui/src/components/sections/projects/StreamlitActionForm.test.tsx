import React, { act } from "react"
import { createRoot } from "react-dom/client"
import { expect, test, vi } from "vitest"
vi.mock("@/lib/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }))
import { StreamlitActionForm } from "./StreamlitActionForm"

test("adds an editable action only on explicit submit and cancels without running anything", () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)
  const onAdd = vi.fn(),
    onCancel = vi.fn()
  try {
    act(() => root.render(<StreamlitActionForm onAdd={onAdd} onCancel={onCancel} />))
    expect(onAdd).not.toHaveBeenCalled()
    expect(Array.from(container.querySelectorAll("label")).map((label) => label.textContent)).toEqual([
      "settings.projects.actions.streamlit.interpreter",
      "settings.projects.actions.streamlit.entrypoint",
      "settings.projects.actions.streamlit.port",
    ])
    act(() => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })))
    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        command:
          "'python' -m streamlit run 'app.py' --server.address=127.0.0.1 --server.port=8501 --server.headless=true",
        waitForUrl: true,
        shell: "posix",
      }),
    )
    act(() => container.querySelector<HTMLButtonElement>('button[type="button"]')!.click())
    expect(onCancel).toHaveBeenCalledOnce()
    expect(onAdd).toHaveBeenCalledOnce()
  } finally {
    act(() => root.unmount())
    container.remove()
  }
})
