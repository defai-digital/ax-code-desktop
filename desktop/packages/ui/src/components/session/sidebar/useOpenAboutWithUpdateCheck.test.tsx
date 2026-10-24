import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

import { useUpdateStore } from "@/stores/useUpdateStore"

import { useOpenAboutWithUpdateCheck } from "./useOpenAboutWithUpdateCheck"

describe("useOpenAboutWithUpdateCheck", () => {
  let root: Root
  let container: HTMLDivElement
  let open: () => void

  const Probe = ({ openAbout }: { openAbout: () => void }) => {
    open = useOpenAboutWithUpdateCheck(openAbout)
    return null
  }

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  test("opens About and refreshes the update state in the background", () => {
    const checkForUpdatesIfStale = vi.fn(async () => {})
    vi.spyOn(useUpdateStore, "getState").mockReturnValue({
      checkForUpdatesIfStale,
    } as unknown as ReturnType<typeof useUpdateStore.getState>)
    const openAbout = vi.fn()
    act(() => root.render(<Probe openAbout={openAbout} />))

    open()

    expect(openAbout).toHaveBeenCalledTimes(1)
    expect(checkForUpdatesIfStale).toHaveBeenCalledTimes(1)
  })

  test("opens About even if the update refresh rejects", async () => {
    const checkForUpdatesIfStale = vi.fn(async () => {
      throw new Error("offline")
    })
    vi.spyOn(useUpdateStore, "getState").mockReturnValue({
      checkForUpdatesIfStale,
    } as unknown as ReturnType<typeof useUpdateStore.getState>)
    const openAbout = vi.fn()
    act(() => root.render(<Probe openAbout={openAbout} />))

    open()

    expect(openAbout).toHaveBeenCalledTimes(1)
  })
})
