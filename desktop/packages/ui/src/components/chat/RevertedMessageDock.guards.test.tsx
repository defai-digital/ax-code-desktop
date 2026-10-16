import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { I18nProvider } from "@/lib/i18n"
import { dict } from "@/lib/i18n/messages/en"

const { revertToMessage, handleSlashRedo, forkFromMessage } = vi.hoisted(() => ({
  revertToMessage: vi.fn(async () => {}),
  handleSlashRedo: vi.fn(async () => {}),
  forkFromMessage: vi.fn(async () => {}),
}))

// The dock reads the session's messages and its revert marker out of the directory store.
const MESSAGES = [
  { id: "msg_user_1", sessionID: "ses_1", role: "user", time: { created: 1 } },
  { id: "msg_assistant_1", sessionID: "ses_1", role: "assistant", time: { created: 2 } },
  { id: "msg_user_2", sessionID: "ses_1", role: "user", time: { created: 3 } },
  { id: "msg_assistant_2", sessionID: "ses_1", role: "assistant", time: { created: 4 } },
  { id: "msg_user_3", sessionID: "ses_1", role: "user", time: { created: 5 } },
]

let syncState: Record<string, unknown> = {}

vi.mock("@/sync/sync-context", () => ({
  useDirectorySync: (selector: (state: Record<string, unknown>) => unknown) => selector(syncState),
}))
vi.mock("@/sync/session-ui-store", () => ({
  useSessionUIStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ revertToMessage, handleSlashRedo, forkFromMessage }),
}))
vi.mock("@/components/ui", () => ({
  toast: { error: vi.fn(), success: vi.fn(), message: vi.fn(), warning: vi.fn() },
}))
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: React.ComponentProps<"button">) => <button {...props}>{children}</button>,
}))
vi.mock("@/components/icon/Icon", () => ({ Icon: () => null }))

const { RevertedMessageDock } = await import("./ChatInput-impl")

describe("RevertedMessageDock guards", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    revertToMessage.mockClear()
    handleSlashRedo.mockClear()
    forkFromMessage.mockClear()
    syncState = {
      session: [{ id: "ses_1", revert: { messageID: "msg_user_1" }, time: { created: 1 } }],
      message: { ses_1: MESSAGES },
      // The dock reads the parts map only to build a preview line.
      part: { get: () => undefined },
    }
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.restoreAllMocks()
  })

  const render = async () => {
    await act(async () => {
      root.render(
        <I18nProvider>
          <RevertedMessageDock sessionId="ses_1" />
        </I18nProvider>,
      )
    })
    // The dock starts collapsed; the rows and their buttons appear once it is expanded.
    const toggle = container.querySelector("button")
    await act(async () => {
      toggle?.click()
    })
  }

  const buttonsLabelled = (label: string) =>
    Array.from(container.querySelectorAll("button")).filter((button) => (button.textContent ?? "").includes(label))

  // `restoringId` is state, so two clicks in the same tick both read it before React re-renders and
  // each sent its own revert: the session came back reverted past the row the user asked for.
  test("sends one revert for two restores clicked in the same tick", async () => {
    await render()
    const restoreButtons = buttonsLabelled(dict["chat.revertPopover.restore"])
    expect(restoreButtons.length).toBeGreaterThanOrEqual(2)

    await act(async () => {
      restoreButtons[0].click()
      restoreButtons[1].click()
    })
    await act(async () => {})

    expect(revertToMessage.mock.calls.length + handleSlashRedo.mock.calls.length).toBe(1)
  })

  test("sends one fork for two fork clicks in the same tick", async () => {
    await render()
    const forkButtons = buttonsLabelled(dict["chat.revertPopover.fork"])
    expect(forkButtons.length).toBeGreaterThanOrEqual(2)

    await act(async () => {
      forkButtons[0].click()
      forkButtons[1].click()
    })
    await act(async () => {})

    expect(forkFromMessage).toHaveBeenCalledTimes(1)
  })
})
