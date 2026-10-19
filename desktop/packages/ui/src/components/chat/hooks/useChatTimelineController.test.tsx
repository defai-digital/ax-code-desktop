import React, { act } from "react"
import { createRoot } from "react-dom/client"
import type { Message, Part } from "@defai-digital/ax-code-sdk/v2"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

import type { MessageListHandle } from "../MessageList"
import { projectDisplayMessages } from "../lib/turns/projectDisplayMessages"
import type { ChatMessageEntry } from "../lib/turns/types"
import { useChatTimelineController } from "./useChatTimelineController"

const entry = (id: string, role: string, parts: Part[] = [], parentID?: string): ChatMessageEntry => ({
  info: { id, role, parentID } as Message,
  parts,
})

const text = (value: string): Part => ({ type: "text", text: value }) as Part

type HistoryMeta = { limit: number; complete: boolean; loading: boolean }

describe("useChatTimelineController history navigation", () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>
  let controller: ReturnType<typeof useChatTimelineController> | null = null
  let setHarnessMessages: React.Dispatch<React.SetStateAction<ChatMessageEntry[]>>
  let historyMeta: HistoryMeta | null = null
  let scrollRef: React.RefObject<HTMLDivElement | null>
  let messageListRef: React.RefObject<MessageListHandle | null>

  const scrollToTurnId = vi.fn()
  const scrollToMessageId = vi.fn()
  const loadMoreMessages = vi.fn()
  const goToBottom = vi.fn()
  const releaseAutoFollow = vi.fn()
  const notePrependedMessages = vi.fn()

  const Harness = ({ initialMessages }: { initialMessages: ChatMessageEntry[] }) => {
    const [messages, setMessages] = React.useState(initialMessages)
    setHarnessMessages = setMessages
    controller = useChatTimelineController({
      sessionId: "ses_1",
      messages,
      historyMeta,
      scrollRef,
      messageListRef,
      loadMoreMessages,
      goToBottom,
      releaseAutoFollow,
      notePrependedMessages,
      isPinned: false,
      showScrollButton: false,
    })
    return null
  }

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    scrollToTurnId.mockReset()
    scrollToTurnId.mockReturnValue(true)
    scrollToMessageId.mockReset()
    scrollToMessageId.mockReturnValue(true)
    loadMoreMessages.mockReset()
    loadMoreMessages.mockResolvedValue(undefined)
    goToBottom.mockReset()
    releaseAutoFollow.mockReset()
    notePrependedMessages.mockReset()
    controller = null
    historyMeta = null
    scrollRef = { current: null }
    messageListRef = {
      current: {
        scrollToTurnId,
        scrollToMessageId,
        captureViewportAnchor: () => null,
        restoreViewportAnchor: () => false,
        scrollToBottom: () => {},
      },
    }
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  const render = (initialMessages: ChatMessageEntry[]) => {
    act(() => {
      root.render(<Harness initialMessages={initialMessages} />)
    })
  }

  test("builds its turn model from the same display projection MessageList renders", async () => {
    render([
      entry("u1", "user", [text("first")]),
      entry("a1", "assistant", [text("reply")], "u1"),
      entry("compact", "system", [{ type: "compaction" } as Part]),
      entry("u2", "user", [text("second")]),
      entry("a2", "assistant", [text("done")], "u2"),
    ])

    // The compaction command is a system message on the wire but a visible user turn
    // in the display projection, so it must be navigable like any other turn.
    expect(controller?.turnIds).toEqual(["u1", "compact", "u2"])
    expect(controller?.turnWindowModel.messageToTurnIndex.get("compact")).toBe(1)

    // MessageList projects the controller's output again, so the projection must be
    // idempotent for entries that were already normalized here.
    const rendered = controller?.renderedMessages ?? []
    expect(projectDisplayMessages(rendered)).toEqual(rendered)

    let navigated = false
    await act(async () => {
      navigated = (await controller?.scrollToTurn("compact")) ?? false
    })
    expect(navigated).toBe(true)
    expect(scrollToTurnId).toHaveBeenCalledWith("compact", { behavior: "auto" })
  })

  test("advances the unseen baseline only by messages prepended above the old first message", async () => {
    const initial = ["m1", "m2", "m3", "m4", "m5"].map((id) => entry(id, "user", [text(id)]))
    historyMeta = { limit: initial.length, complete: false, loading: false }
    render(initial)

    const older = Array.from({ length: 50 }, (_, index) => entry(`old-${index}`, "user", [text(`old ${index}`)]))
    const appended = [
      entry("a1", "assistant", [text("stream 1")], "m5"),
      entry("a2", "assistant", [text("stream 2")], "m5"),
    ]
    loadMoreMessages.mockImplementation(async () => {
      setHarnessMessages((current) => [...older, ...current, ...appended])
    })

    let pendingLoad: Promise<void> | undefined
    await act(async () => {
      pendingLoad = controller?.loadEarlier()
      await Promise.resolve()
    })
    await act(async () => {
      await pendingLoad
    })

    expect(loadMoreMessages).toHaveBeenCalledTimes(1)
    expect(notePrependedMessages).toHaveBeenCalledTimes(1)
    expect(notePrependedMessages).toHaveBeenCalledWith(50)
  })
})
