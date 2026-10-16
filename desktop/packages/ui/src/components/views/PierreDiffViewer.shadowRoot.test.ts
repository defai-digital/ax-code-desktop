import { readFile } from "node:fs/promises"
import path from "node:path"
import { describe, expect, test } from "vitest"

// The viewer renders a web component whose shadow root only exists in a real browser, so this contract
// is asserted against the source, as the other view contracts in this directory are.
describe("PierreDiffViewer shadow-root attachments", () => {
  const read = () => readFile(path.resolve(__dirname, "PierreDiffViewer.tsx"), "utf8")

  // The effects that attach to the rendered node: the capture listener for gutter clicks, and the
  // annotation observer. Both install on a node the render effect replaces.
  const shadowRootEffects = (source: string) => {
    const clickDeps = source.slice(source.indexOf("shadowRoot.addEventListener(\"click\""))
    const observerDeps = source.slice(source.indexOf("const timeoutId = setTimeout(setupObserver, 100)"))
    return [
      clickDeps.slice(0, clickDeps.indexOf("])")),
      observerDeps.slice(0, observerDeps.indexOf("])")),
    ]
  }

  test("re-run whenever the render effect rebuilds the container", async () => {
    const source = await read()
    const [click, observer] = shadowRootEffects(source)

    // Without these the listener and the observer stayed on the detached shadow root after a hunk
    // revert or an agent edit, so gutter clicks stopped resolving a side.
    for (const deps of [click, observer]) {
      expect(deps).toContain("original")
      expect(deps).toContain("modified")
    }
    expect(click).toContain("options")
    expect(observer).toContain("options")
  })
})
