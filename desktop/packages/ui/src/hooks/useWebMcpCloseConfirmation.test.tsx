import React from "react"
import { act } from "react"
import { afterEach, expect, test, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@/test/dom"
import { useWebMcpCloseConfirmation } from "./useWebMcpCloseConfirmation"

vi.mock("@/lib/i18n", () => ({ useI18n: () => ({ t: (key: string, params?: Record<string, string>) => params ? `${key}: ${params.pages}` : key }) }))
const bridge = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock("@/lib/desktopBridge", () => ({ getDesktopBridge: () => bridge }))
afterEach(() => { cleanup(); vi.resetAllMocks() })

function Harness({ done }: { done: (result: unknown) => void }) {
  const { invoke, confirmDialog } = useWebMcpCloseConfirmation()
  return <>{confirmDialog}<button onClick={() => void invoke({ action: "clearProject", directory: "/repo" }).then(done)}>Sign out</button></>
}

test.each([false, true])("destructive confirmation names all pages; confirmed=%s", async (confirmed) => {
  bridge.invoke.mockResolvedValueOnce({ confirmationRequired: true, closeConfirmation: "bound-token", pages: [
    { id: "page-a", sessionID: "ses_a", title: "Draft A" }, { id: "page-b", sessionID: "ses_b", title: "Draft B" },
  ] }).mockResolvedValueOnce({ cleared: true })
  const done = vi.fn()
  render(<Harness done={done} />)
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Sign out" })))
  expect(screen.getByRole("dialog").textContent).toContain("ses_a · Draft A · page-a")
  expect(screen.getByRole("dialog").textContent).toContain("ses_b · Draft B · page-b")
  expect(bridge.invoke).toHaveBeenCalledTimes(1)
  await act(async () => fireEvent.click(screen.getByRole("button", { name: confirmed ? "common.confirm" : "common.cancel" })))
  expect(bridge.invoke).toHaveBeenCalledTimes(confirmed ? 2 : 1)
  if (confirmed) expect(bridge.invoke).toHaveBeenLastCalledWith("desktop_webmcp_browser", {
    action: "clearProject", directory: "/repo", closeConfirmation: "bound-token",
  })
  else expect(done).toHaveBeenCalledWith(null)
})

 test.each(["token=FAKE_AUDIT_SECRET", "x".repeat(5000) + " token=TAIL_SECRET", "x".repeat(5000)])("confirmation filters and bounds page titles: %s", async (title) => {
  bridge.invoke.mockResolvedValueOnce({ confirmationRequired: true, pages: [{ id: "popup", sessionID: "ses_a", title }] })
  render(<Harness done={vi.fn()} />)
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Sign out" })))
  const dialog = screen.getByRole("dialog")
  expect(dialog.innerHTML).not.toContain("FAKE_AUDIT_SECRET")
  expect(dialog.innerHTML).not.toContain("TAIL_SECRET")
  expect(dialog.textContent!.length).toBeLessThan(4500)
  if (title.includes("token=")) expect(dialog.textContent).toContain("[redacted]")
})

test("a changing page cannot create more than two confirmation dialogs", async () => {
  bridge.invoke.mockResolvedValue({ confirmationRequired: true, closeConfirmation: "changed" })
  const done = vi.fn()
  render(<Harness done={done} />)
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Sign out" })))
  for (let attempt = 0; attempt < 2; attempt++) {
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "common.confirm" })))
  }
  expect(screen.queryByRole("dialog")).toBeNull()
  expect(bridge.invoke).toHaveBeenCalledTimes(3)
  expect(done).toHaveBeenCalledWith(null)
})
