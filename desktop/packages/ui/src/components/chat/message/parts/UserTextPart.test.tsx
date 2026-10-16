import React, { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import type { Part } from "@defai-digital/ax-code-sdk/v2"
import { I18nProvider } from "@/lib/i18n"

// The component only reads the effective directory from the sync system, which needs a provider
// that this test has no business standing up.
vi.mock("@/hooks/useEffectiveDirectory", () => ({ useEffectiveDirectory: () => "/repo" }))

const { default: UserTextPart } = await import("./UserTextPart")

const part = {
  id: "prt_1",
  messageID: "msg_1",
  sessionID: "ses_1",
  type: "text",
  text: "a user message long enough to be clamped",
} as unknown as Part

describe("UserTextPart clamped messages", () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  const measured = (scrollHeight: number, clientHeight: number) => {
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(scrollHeight)
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(clientHeight)
  }

  const render = () => {
    act(() => {
      root.render(
        <I18nProvider>
          <UserTextPart part={part} messageId="msg_1" isMobile={false} />
        </I18nProvider>,
      )
    })
  }

  const expandButton = () =>
    Array.from(container.querySelectorAll("button")).find((button) => button.getAttribute("aria-label") === "Expand")

  const clampedText = () => container.querySelector(".line-clamp-2")

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    )
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  test("offers a real control for a clamped message", () => {
    // The only way to read a long message used to be clicking the clipped text, which a keyboard
    // user cannot reach at all.
    measured(120, 40)
    render()

    const expand = expandButton()
    expect(expand).toBeTruthy()
    expect(clampedText()).toBeTruthy()

    act(() => {
      expand?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })

    expect(clampedText()).toBeNull()
    expect(expandButton()).toBeFalsy()
  })

  test("offers nothing for a message that fits", () => {
    measured(40, 40)
    render()

    // The clamp class is applied to every collapsed message whether or not it overflows, so the
    // affordance is what this case is about.
    expect(expandButton()).toBeFalsy()
  })
})
