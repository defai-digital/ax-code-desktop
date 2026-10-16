import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { I18nProvider } from "@/lib/i18n"

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  DialogContent: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  DialogDescription: ({ children }: React.PropsWithChildren) => <p>{children}</p>,
  DialogFooter: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  DialogHeader: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  DialogTitle: ({ children }: React.PropsWithChildren) => <h2>{children}</h2>,
}))

const { useConfirmDialog } = await import("./ConfirmDialog")
const { dict } = await import("@/lib/i18n/messages/en")

describe("useConfirmDialog", () => {
  let container: HTMLDivElement
  let root: Root
  let confirm: ((message: string) => Promise<boolean>) | null

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    confirm = null
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.restoreAllMocks()
  })

  const Probe = () => {
    const { requestConfirm, confirmDialog } = useConfirmDialog()
    confirm = requestConfirm
    return <>{confirmDialog}</>
  }

  const render = () => {
    act(() => {
      root.render(
        <I18nProvider>
          <Probe />
        </I18nProvider>,
      )
    })
  }

  const answer = async (label: string) => {
    const button = Array.from(container.querySelectorAll("button")).find((element) => element.textContent === label)
    if (!button) throw new Error(`button not found: ${label}`)
    await act(async () => {
      button.click()
    })
  }

  test("answers the request a second call replaces", async () => {
    render()

    let first!: Promise<boolean>
    await act(async () => {
      first = confirm!("First question")
    })
    let second!: Promise<boolean>
    await act(async () => {
      second = confirm!("Second question")
    })

    // Without an answer the first caller awaits forever and whatever it was about to do after the
    // confirmation — clearing a busy flag, for one — never runs.
    await act(async () => {
      await Promise.resolve()
    })
    await expect(first).resolves.toBe(false)

    await answer(dict["common.cancel"])
    await expect(second).resolves.toBe(false)
  })
})
