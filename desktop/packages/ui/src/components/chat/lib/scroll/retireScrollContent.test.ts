import { describe, expect, test } from "vitest"
import { retireScrollContent } from "./retireScrollContent"

const flushMicrotasks = () => new Promise<void>((resolve) => queueMicrotask(() => resolve()))

describe("retireScrollContent", () => {
  test("empties a retired container that stayed detached", async () => {
    const node = document.createElement("div")
    node.appendChild(document.createElement("span"))

    retireScrollContent(node, () => false)
    await flushMicrotasks()

    expect(node.childNodes.length).toBe(0)
  })

  test("keeps a container that is connected again", async () => {
    const node = document.createElement("div")
    node.appendChild(document.createElement("span"))
    document.body.appendChild(node)

    retireScrollContent(node, () => false)
    await flushMicrotasks()

    expect(node.childNodes.length).toBe(1)
    node.remove()
  })

  test("keeps a container that was re-adopted as current", async () => {
    const node = document.createElement("div")
    node.appendChild(document.createElement("span"))

    retireScrollContent(node, () => true)
    await flushMicrotasks()

    expect(node.childNodes.length).toBe(1)
  })
})
