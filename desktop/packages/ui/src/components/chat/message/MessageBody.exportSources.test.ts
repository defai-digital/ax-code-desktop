import { describe, expect, test } from "vitest"

import {
  cloneMessageExportElement,
  collectMessageExportSources,
  createMessageExportStack,
} from "./MessageBody"

const source = (text: string) => {
  const element = document.createElement("div")
  element.setAttribute("data-message-text-export-source", "true")
  element.textContent = text
  return element
}

describe("collectMessageExportSources", () => {
  test("returns every export source in document order", () => {
    const root = document.createElement("div")
    const reasoning = document.createElement("div")
    reasoning.appendChild(source("thinking"))
    root.appendChild(source("first answer"))
    root.appendChild(reasoning)
    root.appendChild(source("second answer"))

    // Exporting only the first match put the reasoning trace in the image and
    // dropped every later text part.
    expect(collectMessageExportSources(root).map((element) => element.textContent)).toEqual([
      "first answer",
      "thinking",
      "second answer",
    ])
  })

  test("returns an empty list without a root or sources", () => {
    expect(collectMessageExportSources(null)).toEqual([])
    expect(collectMessageExportSources(document.createElement("div"))).toEqual([])
  })
})

describe("createMessageExportStack", () => {
  test("clones every source in order and hides the per-part action rows", () => {
    const first = source("first")
    const actions = document.createElement("div")
    actions.setAttribute("data-message-actions", "true")
    actions.textContent = "actions"
    first.appendChild(actions)
    const second = source("second")

    const stack = createMessageExportStack([first, second])

    expect(Array.from(stack.children).map((child) => child.textContent)).toEqual(["firstactions", "second"])
    const clonedActions = stack.querySelector<HTMLElement>('[data-message-actions="true"]')
    expect(clonedActions?.style.display).toBe("none")
  })

  test("keeps a single clone identical in content", () => {
    const element = source("only")

    expect(cloneMessageExportElement(element).textContent).toBe("only")
  })
})
