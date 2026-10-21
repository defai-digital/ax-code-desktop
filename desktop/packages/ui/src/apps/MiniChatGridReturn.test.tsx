import { act } from "react"
import { cleanup, render } from "@/test/dom"
import { afterEach, expect, test, vi } from "vitest"
import { MiniChatGridReturn } from "./MiniChatGridReturn"

const state = vi.hoisted(() => ({ session: "ses_b", directory: "/project-b", close: vi.fn(async () => undefined) }))
vi.mock("@/lib/desktop", () => ({ invokeDesktop: state.close }))
vi.mock("@/sync/session-ui-store", () => ({
  useSessionUIStore: (select: (s: { currentSessionId: string }) => unknown) =>
    select({ currentSessionId: state.session }),
}))
vi.mock("@/stores/useDirectoryStore", () => ({
  useDirectoryStore: (select: (s: { currentDirectory: string }) => unknown) =>
    select({ currentDirectory: state.directory }),
}))
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})
test("pop-in targets the native window's launch identity after switching sessions", async () => {
  const channels: Array<{ onmessage: ((event: { data: unknown }) => void) | null }> = []
  vi.stubGlobal(
    "BroadcastChannel",
    class {
      onmessage: ((event: { data: unknown }) => void) | null = null
      constructor() {
        channels.push(this)
      }
      close() {}
    },
  )
  render(<MiniChatGridReturn config={{ sessionId: "ses_a", directory: "/project-a" }} />)
  const channel = channels[0]
  await act(async () => {
    channel.onmessage?.({ data: { type: "mini-chat-return-to-grid", sessionId: "ses_b", directory: "/project-b" } })
  })
  expect(state.close).not.toHaveBeenCalled()
  await act(async () => {
    channel.onmessage?.({ data: { type: "mini-chat-return-to-grid", sessionId: "ses_a", directory: "/project-a" } })
  })
  expect(state.close).toHaveBeenCalledWith("desktop_close_current_window")
})
