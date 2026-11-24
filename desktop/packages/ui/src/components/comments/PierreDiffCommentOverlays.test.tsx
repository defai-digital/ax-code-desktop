import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  cardRenders: 0,
  inputs: [] as { initialText: string; onTextChange?: (text: string) => void }[],
}))
vi.mock("./InlineCommentCard", () => ({
  InlineCommentCard: (props: { draft: { id: string; text: string } }) => {
    mocks.cardRenders += 1
    return <span data-card={props.draft.id}>{props.draft.text}</span>
  },
}))
vi.mock("./InlineCommentInput", () => ({
  InlineCommentInput: (props: { initialText?: string; onTextChange?: (text: string) => void }) => {
    mocks.inputs.push({ initialText: props.initialText ?? "", onTextChange: props.onTextChange })
    return <span data-input>{props.initialText}</span>
  },
}))
vi.mock("./ReviewThreadMarker", () => ({ ReviewThreadMarker: () => null }))

import type { InlineCommentDraft } from "@/stores/useInlineCommentDraftStore"
import { createPostRenderSignal, type PostRenderSignal } from "@/lib/postRenderSignal"
import { PierreDiffCommentOverlays } from "./PierreDiffCommentOverlays"

let frames: FrameRequestCallback[] = []
const flushFrames = () =>
  act(() => {
    const pending = frames
    frames = []
    for (const callback of pending) callback(0)
  })

let root: Root
let container: HTMLDivElement
let wrapper: HTMLDivElement
let shadow: ShadowRoot
let signal: PostRenderSignal
const diffRootRef = { current: null as HTMLDivElement | null }

const draft: InlineCommentDraft = {
  id: "d1",
  sessionKey: "ses",
  source: "diff",
  fileLabel: "a.ts",
  startLine: 400,
  endLine: 400,
  side: "modified",
  code: "",
  language: "ts",
  text: "Check this line",
  createdAt: 1,
} as InlineCommentDraft

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  frames = []
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => frames.push(callback))
  vi.stubGlobal("cancelAnimationFrame", () => {})
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  )
  mocks.cardRenders = 0
  mocks.inputs = []
  signal = createPostRenderSignal()
  container = document.createElement("div")
  wrapper = document.createElement("div")
  const host = document.createElement("diffs-container")
  shadow = host.attachShadow({ mode: "open" })
  wrapper.appendChild(host)
  document.body.append(container, wrapper)
  diffRootRef.current = wrapper
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
  wrapper.remove()
  vi.unstubAllGlobals()
})

const render = (props: Partial<React.ComponentProps<typeof PierreDiffCommentOverlays>> = {}) =>
  act(() =>
    root.render(
      <PierreDiffCommentOverlays
        diffRootRef={diffRootRef}
        drafts={[draft]}
        selection={null}
        editingDraftId={null}
        commentText=""
        fileLabel="a.ts"
        onSave={() => {}}
        onCancel={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
        postRenderSignal={signal}
        {...props}
      />,
    ),
  )
const mountLine = (annotationId: string) => {
  const slot = document.createElement("div")
  slot.setAttribute("data-annotation-id", annotationId)
  shadow.appendChild(slot)
  return slot
}
const pierreRendered = () => {
  act(() => signal.emit())
  flushFrames()
}

test("a comment on a line mounted later attaches when Pierre renders that line, however late", () => {
  render()
  // Far more frames than the old 12-frame budget pass with the line still unmounted.
  for (let index = 0; index < 30; index += 1) pierreRendered()
  expect(document.querySelector("[data-card]")).toBeNull()

  const slot = mountLine("draft-d1")
  pierreRendered()
  expect(slot.querySelector("[data-card='d1']")?.textContent).toBe("Check this line")
})

test("a comment follows its line out of view and back onto a new node", () => {
  const first = mountLine("draft-d1")
  render()
  pierreRendered()
  expect(first.querySelector("[data-card]")).not.toBeNull()

  first.remove()
  pierreRendered()
  expect(document.querySelector("[data-card]")).toBeNull()
  expect(first.querySelector("[data-card]")).toBeNull()

  const second = mountLine("draft-d1")
  pierreRendered()
  expect(second.querySelector("[data-card='d1']")).not.toBeNull()
})

test("renders that leave every target in place do not re-render the overlays", () => {
  mountLine("draft-d1")
  render()
  pierreRendered()
  const settled = mocks.cardRenders
  for (let index = 0; index < 5; index += 1) pierreRendered()
  expect(mocks.cardRenders).toBe(settled)
})

test("text typed in an open comment survives its line node being replaced", () => {
  const selection = { start: 10, end: 10, side: "additions" as const }
  const annotationId = "new-comment-additions-10-10"
  const first = mountLine(annotationId)
  render({ drafts: [], selection })
  pierreRendered()
  expect(first.querySelector("[data-input]")).not.toBeNull()
  act(() => mocks.inputs[mocks.inputs.length - 1].onTextChange?.("Half a thought"))

  first.remove()
  mountLine(annotationId)
  pierreRendered()
  expect(mocks.inputs[mocks.inputs.length - 1].initialText).toBe("Half a thought")
})

test("a line scrolled back in on the same node with a new size is measured again", () => {
  const slot = mountLine("draft-d1")
  let width = 0
  vi.spyOn(slot, "getBoundingClientRect").mockImplementation(() => ({ width, left: 0, right: width }) as DOMRect)
  render()
  pierreRendered()
  const settled = mocks.cardRenders
  width = 640
  pierreRendered()
  expect(mocks.cardRenders).toBeGreaterThan(settled)
})

test("unmounting stops listening to the viewer's renders", () => {
  render()
  act(() => root.unmount())
  root = createRoot(container)
  act(() => signal.emit())
  expect(frames).toHaveLength(0)
})
