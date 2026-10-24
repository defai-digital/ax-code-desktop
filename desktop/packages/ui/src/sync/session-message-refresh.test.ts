import type { AxCodeClient, Message, Part } from "@defai-digital/ax-code-sdk/v2/client"
import { describe, expect, test, vi } from "vitest"
import type { SessionMessageRecord } from "@/types/sessionMessages"
import { ChildStoreManager } from "./child-store"
import { PartMap } from "./part-map"
import { refetchSessionMessagesIfChanged } from "./session-message-refresh"

const assistant: Message = {
  id: "assistant",
  sessionID: "session",
  role: "assistant",
  time: { created: 30 },
  parentID: "user",
  modelID: "test",
  providerID: "test",
  mode: "build",
  agent: "build",
  path: { cwd: "/repo", root: "/repo" },
  tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
}
const text: Part = { id: "text", sessionID: "session", messageID: assistant.id, type: "text", text: "First" }

function setup() {
  const store = new ChildStoreManager().ensureChild("/repo", { bootstrap: false })
  store.setState({ message: { session: [assistant] }, part: PartMap.from({ [assistant.id]: [text] }) })
  const messages = vi.fn(
    async (): Promise<{ data: SessionMessageRecord[] }> => ({
      data: [{ info: structuredClone(assistant), parts: [structuredClone(text)] }],
    }),
  )
  const sdk = { session: { messages } } as unknown as AxCodeClient
  const refresh = () =>
    refetchSessionMessagesIfChanged({ sdk, store, directory: "/repo", sessionId: "session", shouldApply: () => true })
  return { store, messages, refresh }
}

describe("refetchSessionMessagesIfChanged", () => {
  test("does not call setState for an unchanged snapshot", async () => {
    const { store, refresh } = setup()
    const write = vi.spyOn(store, "setState")
    await refresh()
    await refresh()
    expect(write).not.toHaveBeenCalled()
  })

  test("updates text and completion while preserving unconfirmed optimistic messages", async () => {
    const { store, messages, refresh } = setup()
    const optimistic: Message = {
      id: "optimistic",
      sessionID: "session",
      role: "user",
      time: { created: 50 },
      agent: "build",
      model: { providerID: "test", modelID: "test" },
    }
    store.setState({ message: { session: [assistant, optimistic] } })
    messages.mockResolvedValue({
      data: [
        {
          info: { ...assistant, time: { created: 30, completed: 40 }, finish: "stop" },
          parts: [{ ...text, text: "First result" }],
        },
      ],
    })
    await refresh()
    expect(store.getState().message.session).toEqual([
      expect.objectContaining({ id: assistant.id, time: { created: 30, completed: 40 }, finish: "stop" }),
      optimistic,
    ])
    expect(store.getState().part.get(assistant.id)).toEqual([expect.objectContaining({ text: "First result" })])
    const write = vi.spyOn(store, "setState")
    await refresh()
    expect(write).not.toHaveBeenCalled()
  })

  test("updates changed tool status and part membership", async () => {
    const { store, messages, refresh } = setup()
    const tool: Part = {
      id: "tool",
      sessionID: "session",
      messageID: assistant.id,
      type: "tool",
      callID: "call",
      tool: "bash",
      state: { status: "pending", input: {}, raw: "" },
    }
    messages.mockResolvedValue({ data: [{ info: assistant, parts: [text, tool] }] })
    await refresh()
    const completed: Part = {
      ...tool,
      state: {
        status: "completed",
        input: {},
        output: "Done",
        title: "bash",
        metadata: {},
        time: { start: 30, end: 40 },
      },
    }
    messages.mockResolvedValue({ data: [{ info: assistant, parts: [text, completed] }] })
    await refresh()
    expect(store.getState().part.get(assistant.id)).toContainEqual(completed)
  })

  test("keeps the store on a failed fetch", async () => {
    const { store, messages, refresh } = setup()
    messages.mockRejectedValue(new Error("offline"))
    const write = vi.spyOn(store, "setState")
    await expect(refresh()).rejects.toThrow("offline")
    expect(write).not.toHaveBeenCalled()
  })
})
