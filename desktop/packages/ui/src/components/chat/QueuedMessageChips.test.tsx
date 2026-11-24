import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  messages: [] as Array<{ id: string }>,
  inFlight: new Set<string>(),
  viewed: [] as string[],
}))

vi.mock("@/lib/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock("@/sync/notification-store", () => ({
  useSessionHasError: () => false,
  markSessionViewed: (sessionId: string) => mocks.viewed.push(sessionId),
}))
vi.mock("@/sync/sync-context", () => ({ useSessionMessages: () => mocks.messages }))
vi.mock("@/hooks/useQueuedMessageAutoSend", () => ({
  isQueuedEntryInFlight: (id: string) => mocks.inFlight.has(id),
}))

const { QueuedMessageChips } = await import("./QueuedMessageChips")
const { useMessageQueueStore } = await import("@/stores/messageQueueStore")
const { useSessionUIStore } = await import("@/sync/session-ui-store")

const SENT = { id: "q1", content: "first prompt", createdAt: 1, messageId: "msg_1", delivery: "sending" as const }

describe("queued message chips", () => {
  let container: HTMLDivElement
  let root: Root
  let onSend: ReturnType<typeof vi.fn<(id: string) => void>>

  const render = async () => {
    await act(async () => {
      root.render(<QueuedMessageChips onEditMessage={vi.fn()} onSendMessage={onSend} />)
    })
  }
  const buttons = () => [...container.querySelectorAll("button")].map((button) => button.textContent?.trim() ?? "")
  const queue = () => useMessageQueueStore.getState().getQueueForSession("ses_a")

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    onSend = vi.fn<(id: string) => void>()
    mocks.messages = []
    mocks.inFlight.clear()
    mocks.viewed = []
    useSessionUIStore.setState({ currentSessionId: "ses_a" })
    useMessageQueueStore.setState({ queuedMessages: { ses_a: [SENT] } })
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    useMessageQueueStore.setState({ queuedMessages: {}, heldQueues: {} })
  })

  test("a held queue says so and offers Resume queue, which releases it", async () => {
    useMessageQueueStore.setState({ heldQueues: { ses_a: true } })
    await render()
    expect(container.textContent).toContain("chat.queuedMessage.heldTitle")
    expect(container.textContent).toContain("chat.queuedMessage.heldSubtitle")
    const resume = container.querySelector<HTMLButtonElement>("[data-queue-resume]")!
    expect(resume.textContent).toBe("chat.queuedMessage.resume")
    await act(async () => resume.click())
    expect(useMessageQueueStore.getState().heldQueues).toEqual({})
    expect(mocks.viewed).toEqual(["ses_a"])
    expect(container.querySelector("[data-queue-resume]")).toBeNull()
    expect(container.textContent).toContain("chat.queuedMessage.title")
  })

  test("a queue that is not held offers no Resume queue", async () => {
    await render()
    expect(container.querySelector("[data-queue-resume]")).toBeNull()
  })

  test("an entry this window is sending offers nothing that could send it twice", async () => {
    mocks.inFlight.add("q1")
    await render()

    expect(container.textContent).toContain("chat.queuedMessage.sending")
    expect(buttons()).toEqual([])
  })

  test("an unconfirmed entry says so and is sent again only by hand", async () => {
    await render()

    expect(container.textContent).toContain("chat.queuedMessage.unconfirmed")
    const again = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("chat.queuedMessage.sendAgain"),
    )
    await act(async () => again?.click())
    expect(onSend).toHaveBeenCalledWith("q1")
  })

  test("an unconfirmed entry is dropped once the message it was sent as is loaded", async () => {
    mocks.messages = [{ id: "msg_0" }, { id: "msg_1" }]
    await render()

    expect(queue()).toEqual([])
  })

  test("an entry still being sent is not dropped by its own optimistic message", async () => {
    // The optimistic message carries the same id before the runtime accepted the send; a failure must still find it.
    mocks.inFlight.add("q1")
    mocks.messages = [{ id: "msg_1" }]
    await render()

    expect(queue().map((entry) => entry.id)).toEqual(["q1"])
  })
})
