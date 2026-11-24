import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, test, vi } from "vitest"

vi.mock("@/components/projects/NeedsYouQueue", () => ({
  NeedsYouQueue: (props: { className?: string }) => <section data-list="needs-you" className={props.className} />,
}))
vi.mock("@/components/projects/FollowUpList", () => ({
  FollowUpList: (props: { className?: string }) => <section data-list="follow-up" className={props.className} />,
}))

import { DraftHomeAttention } from "./DraftHomeAttention"

let root: Root
let container: HTMLDivElement
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  container = document.createElement("div")
  root = createRoot(container)
})
afterEach(() => act(() => root.unmount()))

test("the draft home lists decisions first, then the quiet follow-ups (G UX-15)", () => {
  act(() => root.render(<DraftHomeAttention />))
  const lists = Array.from(container.querySelectorAll<HTMLElement>("[data-list]"))
  expect(lists.map((list) => list.dataset.list)).toEqual(["needs-you", "follow-up"])
  // Both sit in the composer's column.
  for (const list of lists) expect(list.className).toContain("chat-input-column")
})
