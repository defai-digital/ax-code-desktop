import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, test, vi } from "vitest"

vi.mock("@/lib/i18n", () => ({ useI18n: () => ({ t: translate }) }))
vi.mock("@/stores/useProjectsStore", () => ({ useProjectsStore: () => vi.fn() }))
vi.mock("@/components/ui", () => ({ toast: { info: vi.fn(), success: vi.fn() } }))
vi.mock("@/components/icon/Icon", () => ({ Icon: () => null }))
vi.mock("@/components/ui/dialog", () => {
  const Wrapper = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>
  return {
    Dialog: Wrapper,
    DialogContent: Wrapper,
    DialogDescription: Wrapper,
    DialogFooter: Wrapper,
    DialogHeader: Wrapper,
    DialogTitle: Wrapper,
  }
})
vi.mock("@/components/ui/ScrollableOverlay", () => ({
  ScrollableOverlay: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock("@/components/ui/checkbox", () => ({ Checkbox: () => null }))
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onClick }: { children?: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
}))

import { ImportProjectsDialog } from "./ImportProjectsDialog"

const translate = (key: string) => key
let root: Root
let container: HTMLDivElement
let requests: { resolve: (response: Response) => void; reject: (error: Error) => void; signal: AbortSignal }[]
const render = (open: boolean) => act(() => root.render(<ImportProjectsDialog open={open} onOpenChange={() => {}} />))
const response = (name: string) =>
  new Response(
    JSON.stringify({
      candidates: [{ root: `/${name}`, name, source: "codex", exists: true, alreadyImported: false }],
    }),
  )

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  requests = []
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (_url, init) =>
        new Promise<Response>((resolve, reject) => {
          requests.push({ resolve, reject, signal: init.signal })
        }),
    ),
  )
  container = document.createElement("div")
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  vi.unstubAllGlobals()
})

for (const staleResult of ["success", "failure"] as const) {
  test(`ignores stale ${staleResult} after close and reopen`, async () => {
    render(true)
    render(false)
    expect(requests[0].signal.aborted).toBe(true)
    render(true)
    await act(async () => requests[1].resolve(response("new-project")))
    expect(container.textContent).toContain("/new-project")
    await act(async () => {
      if (staleResult === "success") requests[0].resolve(response("old-project"))
      else requests[0].reject(new Error("stale-failure"))
    })
    expect(container.textContent).toContain("/new-project")
    expect(container.textContent).not.toContain("/old-project")
    expect(container.textContent).not.toContain("stale-failure")
  })
}
