import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, test, vi } from "vitest"

import { formatRelativeAge, type RelativeAgeTranslator } from "@/lib/supervision/relativeAge"
import { useNow } from "./useNow"

const t: RelativeAgeTranslator = (key, params) => `${key}:${params?.count ?? ""}`

function AgeLabel({ updatedAt }: { updatedAt: number }) {
  const now = useNow()
  return <span>{formatRelativeAge(now - updatedAt, t)}</span>
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-10-23T12:00:00.000Z"))
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

test("relative labels advance with the shared clock", async () => {
  const updatedAt = Date.now() - 61 * 60_000
  await act(async () => root.render(<AgeLabel updatedAt={updatedAt} />))
  expect(container.textContent).toBe("notificationCenter.time.hoursAgo:1")

  await act(async () => {
    vi.setSystemTime(new Date("2026-10-23T14:01:00.000Z"))
    vi.advanceTimersByTime(30_000)
  })
  expect(container.textContent).toBe("notificationCenter.time.hoursAgo:3")
})

test("subscribers of the same interval share one timer", async () => {
  await act(async () =>
    root.render(
      <div>
        <AgeLabel updatedAt={0} />
        <AgeLabel updatedAt={0} />
        <AgeLabel updatedAt={0} />
      </div>,
    ),
  )

  expect(vi.getTimerCount()).toBe(1)
})
