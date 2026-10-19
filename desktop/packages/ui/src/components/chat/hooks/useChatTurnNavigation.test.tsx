import React, { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { useChatTurnNavigation } from "./useChatTurnNavigation"

describe("useChatTurnNavigation hash targets", () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>
  let navigation: ReturnType<typeof useChatTurnNavigation> | null = null

  const scrollToTurn = vi.fn()
  const scrollToMessage = vi.fn()
  const resumeToBottom = vi.fn()

  const Probe = ({ turnIds }: { turnIds: string[] }) => {
    navigation = useChatTurnNavigation({
      sessionId: "ses_1",
      turnIds,
      activeTurnId: null,
      scrollToTurn,
      scrollToMessage,
      resumeToBottom,
    })
    return null
  }

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    scrollToTurn.mockReset()
    scrollToMessage.mockReset()
    resumeToBottom.mockReset()
    navigation = null
    window.history.replaceState(null, "", "/")
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  const render = (turnIds: string[]) => {
    act(() => {
      root.render(<Probe turnIds={turnIds} />)
    })
  }

  test("retries a hash whose turn had not loaded yet instead of marking it applied", async () => {
    // The hash was recorded before the scroll ran, so the pass that arrives with the turn -
    // this effect depends on turnIds.length for exactly that reason - returned early and the
    // view never navigated to the hash at all.
    window.location.hash = "#turn-abc"
    scrollToTurn.mockResolvedValueOnce(false)

    render([])
    await act(async () => {})
    expect(scrollToTurn).toHaveBeenCalledTimes(1)
    expect(scrollToTurn).toHaveBeenCalledWith("abc", { behavior: "auto" })

    scrollToTurn.mockResolvedValueOnce(true)
    render(["abc"])
    await act(async () => {})
    expect(scrollToTurn).toHaveBeenCalledTimes(2)

    // Once it was reached, a later turn does not drag the reader back to it.
    render(["abc", "def"])
    await act(async () => {})
    expect(scrollToTurn).toHaveBeenCalledTimes(2)
  })

  test("applies a message hash and then stops re-applying it", async () => {
    window.location.hash = "#message-msg_1"
    scrollToMessage.mockResolvedValueOnce(true)

    render([])
    await act(async () => {})
    expect(scrollToMessage).toHaveBeenCalledTimes(1)
    expect(scrollToMessage).toHaveBeenCalledWith("msg_1", { behavior: "auto" })

    render(["abc"])
    await act(async () => {})
    expect(scrollToMessage).toHaveBeenCalledTimes(1)
  })

  test("does not re-apply a hash written by explicit turn navigation after a turn is appended", async () => {
    scrollToTurn.mockResolvedValue(true)

    render(["abc", "def"])
    await act(async () => {})

    await act(async () => {
      await navigation?.scrollByTurnOffset(-1)
    })
    expect(scrollToTurn).toHaveBeenCalledTimes(1)
    expect(window.location.hash).toBe("#turn-abc")

    render(["abc", "def", "ghi"])
    await act(async () => {})
    expect(scrollToTurn).toHaveBeenCalledTimes(1)
  })

  test("does not re-apply a hash written by explicit message navigation after a turn is appended", async () => {
    scrollToMessage.mockResolvedValue(true)

    render(["abc"])
    await act(async () => {})

    await act(async () => {
      await navigation?.scrollToMessageId("msg_1")
    })
    expect(scrollToMessage).toHaveBeenCalledTimes(1)
    expect(window.location.hash).toBe("#message-msg_1")

    render(["abc", "def"])
    await act(async () => {})
    expect(scrollToMessage).toHaveBeenCalledTimes(1)
  })
})
