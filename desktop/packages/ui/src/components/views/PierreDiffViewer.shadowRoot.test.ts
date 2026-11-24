import { readFile } from "node:fs/promises"
import path from "node:path"
import { describe, expect, test } from "vitest"

// The viewer renders a web component whose shadow root only exists in a real browser, so this contract
// is asserted against the source, as the other view contracts in this directory are.
describe("PierreDiffViewer shadow-root attachments", () => {
  const read = () => readFile(path.resolve(__dirname, "PierreDiffViewer.tsx"), "utf8")

  // The effect that attaches to the rendered node: the capture listener for gutter clicks, installed on a node the
  // render effect replaces. (Annotation re-checks follow Pierre's onPostRender signal, which no rebuild strands.)
  const clickEffectDeps = (source: string) => {
    const clickDeps = source.slice(source.indexOf("shadowRoot.addEventListener(\"click\""))
    return clickDeps.slice(0, clickDeps.indexOf("])"))
  }

  test("re-run whenever the render effect rebuilds the container", async () => {
    const source = await read()
    const click = clickEffectDeps(source)

    // Without these the listener stayed on the detached shadow root after a hunk revert or an agent edit, so
    // gutter clicks stopped resolving a side.
    expect(click).toContain("original")
    expect(click).toContain("modified")
    expect(click).toContain("options")
  })
})
