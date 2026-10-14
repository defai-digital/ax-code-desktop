import { act, createRef, type RefObject } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import type { Message, Part } from "@defai-digital/ax-code-sdk/v2"

import { I18nProvider } from "@/lib/i18n"
import { useUIStore } from "@/stores/useUIStore"
import type { ChatMessageEntry } from "./lib/turns/types"
import MessageList, { type MessageListHandle } from "./MessageList-impl"

vi.mock("./ChatMessage", () => ({
  default: ({ message }: { message: ChatMessageEntry }) => (
    <div id={`message-${message.info.id}`} data-message-id={message.info.id} />
  ),
}))

const text = (id: string, value: string): Part => ({ id, type: "text", text: value }) as Part

const foldMessages = (): ChatMessageEntry[] => {
  const user = {
    info: { id: "user", role: "user", time: { created: 1 } } as Message,
    parts: [text("user-text", "Go")],
  } as ChatMessageEntry
  const steps = Array.from({ length: 100 }, (_, index) => {
    return {
      info: {
        id: `step-${index}`,
        role: "assistant",
        parentID: "user",
        time: { created: index + 2, completed: index + 3 },
      } as Message,
      parts: [
        {
          id: `step-${index}-tool`,
          type: "tool",
          tool: "bash",
          callID: `step-${index}`,
          state: { status: "completed" },
        } as Part,
      ],
    } as ChatMessageEntry
  })
  const finalMessage = {
    info: {
      id: "final",
      role: "assistant",
      parentID: "user",
      finish: "stop",
      time: { created: 1000, completed: 1001 },
    } as Message,
    parts: [text("final-text", "Done")],
  } as ChatMessageEntry
  return [user, ...steps, finalMessage]
}

describe("message navigation into a windowed fold", () => {
  let container: HTMLDivElement
  let root: Root
  let handleRef: RefObject<MessageListHandle | null>
  let scrollTo: ReturnType<typeof vi.fn>
  const previousActivityMode = useUIStore.getState().activityRenderMode

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation((query: string) => ({
        matches: query === "(prefers-reduced-motion: reduce)",
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    )
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
        takeRecords() {
          return []
        }
      },
    )
    useUIStore.setState({ activityRenderMode: "collapsed" })
    scrollTo = vi.fn()
    handleRef = createRef<MessageListHandle>()
    container = document.createElement("div")
    container.setAttribute("data-scrollbar", "chat")
    Object.defineProperty(container, "scrollHeight", { configurable: true, value: 5000 })
    Object.defineProperty(container, "clientHeight", { configurable: true, value: 800 })
    container.scrollTop = 0
    container.scrollTo = scrollTo as unknown as typeof container.scrollTo
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    useUIStore.setState({ activityRenderMode: previousActivityMode })
    vi.unstubAllGlobals()
  })

  const renderList = () => {
    act(() => {
      root.render(
        <I18nProvider>
          <MessageList
            ref={handleRef}
            sessionKey="message-navigation"
            turnStart={0}
            messages={foldMessages()}
            sessionIsWorking={false}
            onMessageContentChange={() => {}}
            getAnimationHandlers={() => ({ onChunk: () => {}, onComplete: () => {} })}
            hasMoreAbove={false}
            isLoadingOlder={false}
            onLoadOlder={() => {}}
            scrollRef={{ current: container }}
          />
        </I18nProvider>,
      )
    })
  }

  // The timeline controller calls this from a layout effect, which commits the
  // fold expansion before the next frame. Flush that update before awaiting
  // the navigation poll; one async act holds the update until the poll gives up.
  const navigateTo = async (messageId: string) => {
    let result: boolean | Promise<boolean> = false
    act(() => {
      result = handleRef.current?.scrollToMessageId(messageId) ?? false
    })
    if (typeof result === "boolean") return result
    const pending = result
    let scrolled = false
    await act(async () => {
      scrolled = await pending
    })
    return scrolled
  }

  test("a collapsed fold expands and scrolls to the requested step", async () => {
    renderList()
    expect(container.querySelector('[data-message-id="step-80"]')).toBeNull()

    await expect(navigateTo("step-80")).resolves.toBe(true)

    expect(container.querySelector('[data-message-id="step-80"]')).not.toBeNull()
    expect(container.querySelector("[aria-expanded]")?.getAttribute("aria-expanded")).toBe("true")
    expect(scrollTo).toHaveBeenCalled()
  })

  test("an open fold away from the end scrolls to a step outside its window", async () => {
    renderList()
    const header = container.querySelector<HTMLButtonElement>("[aria-expanded]")
    act(() => {
      header?.click()
    })
    expect(container.querySelector('[data-message-id="step-0"]')).not.toBeNull()
    expect(container.querySelector('[data-message-id="step-19"]')).not.toBeNull()
    expect(container.querySelector('[data-message-id="step-80"]')).toBeNull()

    await expect(navigateTo("step-80")).resolves.toBe(true)

    expect(container.querySelector('[data-message-id="step-80"]')).not.toBeNull()
    expect(container.querySelector('[data-message-id="step-81"]')).toBeNull()
    expect(scrollTo).toHaveBeenCalled()
  })
})
