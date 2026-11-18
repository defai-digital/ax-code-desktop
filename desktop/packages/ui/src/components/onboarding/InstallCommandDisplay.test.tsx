import React, { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { I18nProvider } from "@/lib/i18n"
import { dict } from "@/lib/i18n/messages/en"
import type { OnboardingPlatform } from "./types"
import { getInstallCommand } from "./installCommands"
import { InstallCommandDisplay } from "./InstallCommandDisplay"
import { useInstallCommandCopy } from "./useInstallCommandCopy"

const { copy } = vi.hoisted(() => ({ copy: vi.fn() }))
vi.mock("@/lib/clipboard", () => ({ copyTextToClipboard: copy }))

function CopyHarness(props: { platform: OnboardingPlatform; layout: "centered" | "spread" }) {
  const { copied, handleCopy } = useInstallCommandCopy(props.platform)
  return <InstallCommandDisplay {...props} copied={copied} onCopy={handleCopy} />
}
let root: ReturnType<typeof createRoot> | null
let container: HTMLDivElement
beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  copy.mockReset().mockResolvedValue({ ok: true, method: "clipboard" })
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root?.unmount())
  root = null
  container.remove()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
const render = (platform: OnboardingPlatform = "linux", layout: "centered" | "spread" = "spread") => {
  act(() =>
    root?.render(
      <I18nProvider>
        <CopyHarness platform={platform} layout={layout} />
      </I18nProvider>,
    ),
  )
}
const clickCopy = async () => {
  const button = container.querySelector("button")
  expect(button?.getAttribute("aria-label")).toBe(dict["onboarding.common.copyToClipboard"])
  await act(async () => button?.click())
}

test.each(["macos", "windows", "linux", "unknown"] as const)(
  "copies the displayed %s install command and resets feedback",
  async (platform) => {
    render(platform)
    expect(container.querySelector("code")?.textContent).toBe(getInstallCommand(platform))
    await clickCopy()
    expect(copy).toHaveBeenCalledWith(getInstallCommand(platform))
    expect(container.textContent).toBe(dict["onboarding.common.status.copiedToClipboard"])
    act(() => vi.advanceTimersByTime(2000))
    expect(container.querySelector("code")?.textContent).toBe(getInstallCommand(platform))
  },
)

test("a failed copy reports the error and keeps the command available", async () => {
  copy.mockResolvedValue({ ok: false, error: "clipboard blocked" })
  const error = vi.spyOn(console, "error").mockImplementation(() => {})
  render("macos", "centered")
  await clickCopy()
  expect(error).toHaveBeenCalledWith("Failed to copy:", "clipboard blocked")
  expect(container.querySelector("code")?.textContent).toBe(getInstallCommand("macos"))
  expect(vi.getTimerCount()).toBe(0)
})

test("leaving onboarding clears active feedback and ignores a pending clipboard completion", async () => {
  let resolveCopy: (value: { ok: true; method: "clipboard" }) => void = () => {}
  copy.mockImplementation(
    () =>
      new Promise((resolve) => {
        resolveCopy = resolve
      }),
  )
  render()
  await clickCopy()
  act(() => {
    root?.unmount()
    root = null
  })
  await act(async () => resolveCopy({ ok: true, method: "clipboard" }))
  expect(vi.getTimerCount()).toBe(0)
  expect(container.childNodes).toHaveLength(0)
})

test("unmounting during successful feedback clears its timer", async () => {
  render()
  await clickCopy()
  expect(vi.getTimerCount()).toBe(1)
  act(() => {
    root?.unmount()
    root = null
  })
  expect(vi.getTimerCount()).toBe(0)
})
