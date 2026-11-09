import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { useUIStore } from "@/stores/useUIStore"
import { useResponsivePanels } from "./useResponsivePanels"

function Harness(props: { isMobile?: boolean; isTablet?: boolean }) {
  useResponsivePanels({ isMobile: props.isMobile ?? false, isTablet: props.isTablet ?? false })
  return <button onClick={() => useUIStore.getState().toggleSidebar()}>Open sessions</button>
}

let container: HTMLDivElement
let root: Root
const resize = (width: number, height = 900) => {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width })
  Object.defineProperty(window, "innerHeight", { configurable: true, value: height })
  window.dispatchEvent(new Event("resize"))
}
const settle = () => act(() => vi.advanceTimersByTime(150))

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  vi.useFakeTimers()
  resize(1280)
  useUIStore.setState({ isSidebarOpen: true, isRightSidebarOpen: true, isBottomTerminalOpen: false })
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

test("a repeated resize at the same narrow width retains a manually reopened sidebar", () => {
  act(() => root.render(<Harness />))
  act(() => resize(600))
  settle()
  expect(useUIStore.getState().isSidebarOpen).toBe(false)
  act(() => container.querySelector<HTMLButtonElement>("button")!.click())
  act(() => resize(600))
  settle()
  expect(useUIStore.getState().isSidebarOpen).toBe(true)
})

test("a pending resize cannot overwrite a newer close and reopen action", () => {
  act(() => root.render(<Harness />))
  act(() => resize(800))
  act(() => {
    container.querySelector<HTMLButtonElement>("button")!.click()
    container.querySelector<HTMLButtonElement>("button")!.click()
  })
  settle()
  expect(useUIStore.getState().isSidebarOpen).toBe(true)
  expect(useUIStore.getState().isRightSidebarOpen).toBe(false)
})

test("automatic collapse restores at the wider threshold and ignores height-only changes for sidebars", () => {
  act(() => root.render(<Harness />))
  act(() => resize(800))
  settle()
  expect(useUIStore.getState().isSidebarOpen).toBe(false)
  act(() => resize(1000))
  settle()
  expect(useUIStore.getState().isSidebarOpen).toBe(true)
  act(() => resize(800))
  settle()
  act(() => container.querySelector<HTMLButtonElement>("button")!.click())
  act(() => resize(800, 600))
  settle()
  expect(useUIStore.getState().isSidebarOpen).toBe(true)
})

test("touch layouts do not collapse panels on keyboard resize and unmount cancels pending work", () => {
  act(() => root.render(<Harness isTablet />))
  act(() => resize(600, 500))
  settle()
  expect(useUIStore.getState().isSidebarOpen).toBe(true)
  act(() => root.render(<Harness />))
  act(() => resize(500, 400))
  act(() => root.unmount())
  useUIStore.setState({ isSidebarOpen: true })
  settle()
  expect(useUIStore.getState().isSidebarOpen).toBe(true)
  root = createRoot(container)
})

test("a pending height resize respects a newer terminal choice without suppressing sidebar collapse", () => {
  useUIStore.setState({ isBottomTerminalOpen: true })
  act(() => root.render(<Harness />))
  act(() => resize(800, 500))
  act(() => {
    useUIStore.getState().setBottomTerminalOpen(false)
    useUIStore.getState().setBottomTerminalOpen(true)
  })
  settle()
  expect(useUIStore.getState().isBottomTerminalOpen).toBe(true)
  expect(useUIStore.getState().isSidebarOpen).toBe(false)
  act(() => resize(800, 900))
  settle()
  expect(useUIStore.getState().isBottomTerminalOpen).toBe(true)
})

test("automatic right-panel restore honors hysteresis and a subsequent manual close", () => {
  act(() => root.render(<Harness />))
  act(() => resize(1100))
  settle()
  expect(useUIStore.getState().isRightSidebarOpen).toBe(false)
  act(() => resize(1180))
  settle()
  expect(useUIStore.getState().isRightSidebarOpen).toBe(false)
  act(() => resize(1250))
  settle()
  expect(useUIStore.getState().isRightSidebarOpen).toBe(true)
  act(() => useUIStore.getState().setRightSidebarOpen(false))
  act(() => resize(1300))
  settle()
  expect(useUIStore.getState().isRightSidebarOpen).toBe(false)
})
