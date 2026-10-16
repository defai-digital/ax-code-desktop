import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { I18nProvider } from "@/lib/i18n"
import { dict } from "@/lib/i18n/messages/en"

type CleanupResult = { completedIds: string[]; failedIds: string[]; action: "archive" | "delete"; skippedReason?: string }

const { runCleanup, toastMessage, toastSuccess, toastError } = vi.hoisted(() => ({
  runCleanup: vi.fn<(options?: { force?: boolean }) => Promise<CleanupResult>>(),
  toastMessage: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock("@/components/ui", () => ({
  toast: { message: toastMessage, success: toastSuccess, error: toastError },
}))
vi.mock("@/hooks/useSessionAutoCleanup", () => ({
  useSessionAutoCleanup: () => ({ candidates: [], isRunning: false, runCleanup, keepRecentCount: 5, action: "delete" }),
}))

const stubStore = <State,>(state: State) => {
  const useStore = ((selector?: (value: State) => unknown) => (selector ? selector(state) : state)) as unknown as {
    (selector?: (value: State) => unknown): unknown
    getState: () => State
  }
  useStore.getState = () => state
  return useStore
}

vi.mock("@/stores/useUIStore", () => ({
  useUIStore: stubStore({
    autoDeleteEnabled: true,
    autoDeleteAfterDays: 30,
    sessionRetentionAction: "delete" as const,
    setAutoDeleteEnabled: vi.fn(),
    setAutoDeleteAfterDays: vi.fn(),
    setSessionRetentionAction: vi.fn(),
  }),
}))

const { SessionRetentionSettings } = await import("./SessionRetentionSettings")

const runCleanupButton = (container: HTMLElement): HTMLButtonElement => {
  const label = dict["settings.openchamber.sessionRetention.actions.runCleanupNow"]
  const button = Array.from(container.querySelectorAll("button")).find((element) => element.textContent === label)
  if (!button) throw new Error("run cleanup button not found")
  return button
}

describe("SessionRetentionSettings manual cleanup", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    runCleanup.mockReset()
    toastMessage.mockReset()
    toastSuccess.mockReset()
    toastError.mockReset()
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.restoreAllMocks()
  })

  const render = () => {
    act(() => {
      root.render(
        <I18nProvider>
          <SessionRetentionSettings />
        </I18nProvider>,
      )
    })
  }

  const click = async () => {
    await act(async () => {
      runCleanupButton(container).click()
    })
  }

  // A forced run is refused while the session list is loading, so nothing was evaluated. The click used
  // to answer "no sessions eligible", telling the user their sessions had been checked and passed.
  test("a run refused while sessions load does not claim that nothing is eligible", async () => {
    runCleanup.mockResolvedValue({ completedIds: [], failedIds: [], action: "delete", skippedReason: "loading" })
    render()
    await click()

    expect(toastMessage).toHaveBeenCalledWith(dict["settings.openchamber.sessionRetention.toast.stillLoading"])
    expect(toastMessage).not.toHaveBeenCalledWith(
      dict["settings.openchamber.sessionRetention.toast.noneEligibleDelete"],
    )
  })

  test("a run that found no candidates still says nothing is eligible", async () => {
    runCleanup.mockResolvedValue({ completedIds: [], failedIds: [], action: "delete", skippedReason: "no-candidates" })
    render()
    await click()

    expect(toastMessage).toHaveBeenCalledWith(
      dict["settings.openchamber.sessionRetention.toast.noneEligibleDelete"],
    )
  })

  test("a run that deleted sessions reports the count", async () => {
    runCleanup.mockResolvedValue({ completedIds: ["a", "b"], failedIds: [], action: "delete" })
    render()
    await click()

    expect(toastSuccess).toHaveBeenCalledWith(dict["settings.openchamber.sessionRetention.toast.deletedCount"].replace("{count}", "2"))
    expect(toastMessage).not.toHaveBeenCalled()
  })
})
