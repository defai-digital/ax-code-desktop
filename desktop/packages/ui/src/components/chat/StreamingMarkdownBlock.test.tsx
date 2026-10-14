import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { StreamingMarkdownBlock } from "./StreamingMarkdownBlock"
import { useEnteredBlockCount } from "./useEnteredBlockCount"

// Mirrors MarkdownRenderer: wrappers keyed by index, each child keyed by its
// (changing) block key, as the live tail re-keys on every token.
const Harness = ({ blocks }: { blocks: string[] }) => {
  const entered = useEnteredBlockCount(blocks.length, true)
  return (
    <>
      {blocks.map((text, index) => (
        <StreamingMarkdownBlock key={index} index={index} enteredBlockCount={entered}>
          <p key={text}>{text}</p>
        </StreamingMarkdownBlock>
      ))}
    </>
  )
}

describe("StreamingMarkdownBlock", () => {
  let root: Root
  let container: HTMLDivElement
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })
  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
  })

  const render = (blocks: string[]) => act(() => root.render(<Harness blocks={blocks} />))
  const wrappers = () => Array.from(container.querySelectorAll<HTMLElement>("[data-md-block]"))

  test("does not animate blocks already present when the message mounts", () => {
    render(["one", "two", "three"])
    expect(wrappers().some((el) => el.classList.contains("oc-md-block-enter"))).toBe(false)
  })

  test("animates a newly committed block once, while the tail keeps streaming", () => {
    render(["one"])
    render(["one", "tw"])
    const second = wrappers()[1]
    expect(second?.classList.contains("oc-md-block-enter")).toBe(true)

    render(["one", "two words"])
    expect(wrappers()[1]).toBe(second)
    expect(second?.classList.contains("oc-md-block-enter")).toBe(true)
  })

  test("cascades blocks committed in the same pass", () => {
    render(["one"])
    render(["one", "two", "three", "four"])
    const delays = wrappers().map((el) => el.style.getPropertyValue("--oc-md-enter-delay"))
    expect(delays).toEqual(["", "", "55ms", "110ms"])
    expect(wrappers()[0]?.classList.contains("oc-md-block-enter")).toBe(false)
  })
})
