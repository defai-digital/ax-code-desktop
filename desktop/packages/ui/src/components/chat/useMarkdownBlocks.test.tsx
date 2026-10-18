import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { PreparedMarkdown } from "./PreparedMarkdown"
import { useStableMarkdownBlocks } from "./useMarkdownBlocks"
import { parseMarkdownInWorker } from "./markdownWorkerParser"
import type { MarkdownParseRequest, ParsedMarkdownBlock } from "./markdownWorkerProtocol"

const worker = vi.hoisted(() => ({ request: vi.fn(), release: vi.fn(), subscribeCapacity: vi.fn() }))
vi.mock("./markdownWorkerClient", () => ({ markdownWorkerClient: worker }))

const longText = "**original** " + "word ".repeat(4000)
const Harness = ({ text, live, baseKey }: { text: string; live: boolean; baseKey: string }) => {
  const blocks = useStableMarkdownBlocks(text, live, baseKey)
  return (
    <>
      {blocks.map((block) => (
        <PreparedMarkdown key={block.key} block={block} components={{}} />
      ))}
    </>
  )
}

describe("Large Markdown lifecycle", () => {
  let root: Root
  let container: HTMLDivElement
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
    worker.request.mockReset()
    worker.release.mockReset()
    worker.subscribeCapacity.mockReset()
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })
  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
  })
  const render = (text: string, live = true, baseKey = "test") => {
    act(() => root.render(<Harness text={text} live={live} baseKey={baseKey} />))
  }
  const completion = (index: number) => {
    const [, request, callback] = worker.request.mock.calls[index] as [
      object,
      Omit<MarkdownParseRequest, "id">,
      (blocks: ParsedMarkdownBlock[] | null) => void,
    ]
    return () => callback(parseMarkdownInWorker({ ...request, id: index }))
  }

  test("retains completed block identities across cloned worker responses", () => {
    let current: ParsedMarkdownBlock[] = []
    const Probe = ({ text }: { text: string }) => {
      current = useStableMarkdownBlocks(text, true, "identity")
      return null
    }
    const initial = longText + "\n\nTail"
    act(() => root.render(<Probe text={initial} />))
    act(completion(0))
    const completed = current[0]
    const liveTail = current.at(-1)
    act(() => root.render(<Probe text={initial + " grows"} />))
    act(completion(1))
    expect(current[0]).toBe(completed)
    expect(current[0].tree).toBe(completed.tree)
    expect(current.at(-1)).not.toBe(liveTail)
    expect(current.at(-1)?.src).toBe("Tail grows")
  })

  test("shows complete escaped text first, then accepts in-flight streaming previews", () => {
    render(longText)
    expect(container.textContent).toBe(longText)
    expect(container.querySelector("strong")).toBeNull()
    const finishFirst = completion(0)
    render(longText + " newer")
    act(finishFirst)
    expect(container.querySelector("strong")?.textContent).toBe("original")
    act(completion(1))
    expect(container.textContent).toContain("newer")
  })

  test("ignores old live results after completion and renders the exact final source", () => {
    render(longText)
    const finishLive = completion(0)
    render(longText + " **final**", false)
    act(finishLive)
    expect(container.querySelector("strong")).toBeNull()
    act(completion(1))
    expect(container.querySelectorAll("strong")).toHaveLength(2)
    expect(container.textContent).toContain("final")
  })

  test("rejects a result from an old message or replaced source", () => {
    render(longText)
    const old = completion(0)
    const replacement = "**replacement** " + "next ".repeat(4000)
    render(replacement, true, "other-message")
    act(old)
    expect(container.textContent).toBe(replacement)
    expect(container.querySelector("strong")).toBeNull()
    const oldReplacement = completion(1)
    render(longText, true, "other-message")
    act(oldReplacement)
    expect(container.textContent).toBe(longText)
  })

  test("does not let an older parse overwrite a newer complete fallback", () => {
    render(longText)
    const finishOld = completion(0)
    const latest = longText + " final appended text"
    render(latest)
    const callback = worker.request.mock.calls[1][2] as (blocks: ParsedMarkdownBlock[] | null) => void
    act(() => callback(null))
    act(finishOld)
    expect(container.textContent).toBe(latest)
    expect(container.querySelector("strong")).toBeNull()
  })

  test("releases work on unmount and keeps small bodies on the existing synchronous path", () => {
    render("**small**")
    expect(worker.request).not.toHaveBeenCalled()
    expect(container.querySelector("strong")?.textContent).toBe("small")
    render(longText)
    const finish = completion(0)
    act(() => root.unmount())
    expect(worker.release).toHaveBeenCalled()
    act(finish)
    expect(container.textContent).toBe("")
    root = createRoot(container)
  })

  test("retries an unchanged deferred body when capacity becomes available and unsubscribes", () => {
    const unsubscribe = vi.fn()
    worker.request.mockReturnValueOnce("deferred").mockReturnValue("queued")
    worker.subscribeCapacity.mockReturnValue(unsubscribe)
    render(longText, false)
    const notify = worker.subscribeCapacity.mock.calls[0][0] as () => void
    act(notify)
    expect(worker.request).toHaveBeenCalledTimes(2)
    expect(unsubscribe).toHaveBeenCalledOnce()
    act(completion(1))
    expect(container.querySelector("strong")?.textContent).toBe("original")
  })
})
