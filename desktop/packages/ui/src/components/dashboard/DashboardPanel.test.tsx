import { act } from "react"
import { afterEach, describe, expect, test, vi } from "vitest"

import { cleanup, fireEvent, render, screen } from "@/test/dom"
import { DashboardPanel } from "./DashboardPanel"

const session = vi.hoisted(() => ({ id: "ses_1", directory: "/repo ", title: "Fixture session" }))

vi.mock("@/sync/session-ui-store", () => ({
  useSessionUIStore: (select: (state: { currentSessionId: string }) => unknown) => select({ currentSessionId: session.id }),
}))
vi.mock("@/sync/sync-context", () => ({ useSessions: () => [session] }))

const status = (version: string) => Response.json({ currentVersion: version })

function setup() {
  const requests: Array<{ signal?: AbortSignal | null; resolve: (response: Response) => void }> = []
  const fetchVersion = vi.fn((_url: string, options?: RequestInit) =>
    new Promise<Response>((resolve) => requests.push({ signal: options?.signal, resolve })),
  )
  vi.stubGlobal("fetch", fetchVersion)
  const open = vi.spyOn(window, "open").mockImplementation(() => null)
  const { container } = render(<DashboardPanel directory={session.directory} />)
  return {
    requests,
    open,
    frame: () => container.querySelector("iframe"),
    openButton: screen.getByRole("button", { name: "Open" }) as HTMLButtonElement,
    refresh: () => fireEvent.click(screen.getByRole("button", { name: "Refresh" })),
    settle: (index: number, response: Response) => act(async () => requests[index].resolve(response)),
  }
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("Dashboard report version", () => {
  test("re-reads the version before refreshing or opening the report for the same session", async () => {
    const panel = setup()
    expect(panel.frame()).toBeNull()
    expect(panel.openButton.disabled).toBe(true)
    fireEvent.click(panel.openButton)
    expect(panel.open).not.toHaveBeenCalled()

    await panel.settle(0, status("7.10.2"))
    expect(panel.frame()?.src).toBe(`${window.location.origin}/dre-graph/session/ses_1?directory=%2Frepo+`)
    panel.refresh()
    expect(panel.requests).toHaveLength(2)
    expect(panel.frame()).toBeNull()
    expect(panel.openButton.disabled).toBe(true)
    fireEvent.click(panel.openButton)
    expect(panel.open).not.toHaveBeenCalled()

    await panel.settle(1, status("v7.24.1+local.1"))
    const url = `${window.location.origin}/run-report/session/ses_1?directory=%2Frepo+`
    expect(panel.frame()?.src).toBe(url)
    fireEvent.click(panel.openButton)
    expect(panel.open).toHaveBeenCalledExactlyOnceWith(url, "_blank", "noopener,noreferrer")
  })

  test("reloads the report when its route does not change", async () => {
    const panel = setup()
    await panel.settle(0, status("7.24.1"))
    const initial = panel.frame()
    expect(initial?.src).toContain("/run-report/")

    panel.refresh()
    expect(initial?.isConnected).toBe(false)
    await panel.settle(1, status("7.24.1"))
    expect(panel.frame()?.src).toBe(initial?.src)
    expect(panel.frame()).not.toBe(initial)
  })

  test("aborts superseded and unmounted reads and ignores their late responses", async () => {
    const panel = setup()
    panel.refresh()
    expect(panel.requests[0].signal?.aborted).toBe(true)
    await panel.settle(1, status("7.24.1"))
    await panel.settle(0, status("7.10.2"))
    expect(panel.frame()?.src).toContain("/run-report/")

    panel.refresh()
    cleanup()
    expect(panel.requests[2].signal?.aborted).toBe(true)
    await panel.settle(2, status("7.10.2"))
    expect(panel.frame()).toBeNull()
  })

  test("times out a read that ignores abort and keeps the fallback after it settles", async () => {
    vi.useFakeTimers()
    const panel = setup()
    await act(async () => vi.advanceTimersByTimeAsync(10_000))
    expect(panel.requests[0].signal?.aborted).toBe(true)
    expect(panel.frame()?.src).toContain("/dre-graph/")
    expect(panel.openButton.disabled).toBe(false)
    await panel.settle(0, status("7.24.1"))
    expect(panel.frame()?.src).toContain("/dre-graph/")
  })

  test.each([
    ["an HTTP error", () => new Response(null, { status: 503 })],
    ["malformed JSON", () => new Response("not JSON")],
    ["a malformed version", () => status("7.24.1junk")],
  ])("shows the scoped legacy report after %s", async (_name, response) => {
    const panel = setup()
    await panel.settle(0, response())
    expect(panel.frame()?.src).toBe(`${window.location.origin}/dre-graph/session/ses_1?directory=%2Frepo+`)
    expect(panel.openButton.disabled).toBe(false)
  })
})
