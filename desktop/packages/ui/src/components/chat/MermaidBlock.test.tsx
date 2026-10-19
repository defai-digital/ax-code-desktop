import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { getDefaultTheme } from "@/lib/theme/themes"
import { I18nProvider } from "@/lib/i18n"
import { MermaidBlock } from "./MermaidBlock"
import { renderMermaidDiagram } from "./mermaidRenderer"
import { MermaidRenderError } from "./mermaidProtocol"

vi.mock("./mermaidRenderer", () => ({ renderMermaidDiagram: vi.fn() }))
const render = vi.mocked(renderMermaidDiagram)
let host: HTMLDivElement
let root: Root
const props = { source: "flowchart LR; A-->B", mode: "svg" as const, theme: getDefaultTheme(false) }
const show = async (overrides = {}) => {
  await act(async () =>
    root.render(
      <I18nProvider>
        <MermaidBlock {...props} {...overrides} />
      </I18nProvider>,
    ),
  )
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  render.mockReset()
  host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

test("waits for finalized streaming content before rendering", async () => {
  render.mockResolvedValue('<svg viewBox="0 0 1 1"><text>Done</text></svg>')
  await show({ deferRender: true })
  expect(render).not.toHaveBeenCalled()
  expect(host.textContent).toContain("when the response is complete")
  await show()
  expect(host.querySelector("img")).not.toBeNull()
})

test("hides stale output while source/theme changes and ignores obsolete completions", async () => {
  let resolveOld: (value: string) => void = () => {}
  render
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve
        }),
    )
    .mockResolvedValueOnce('<svg viewBox="0 0 1 1"><text>New</text></svg>')
  await show()
  const oldSignal = render.mock.calls[0][1]
  await show({ source: "flowchart LR; C-->D", theme: getDefaultTheme(true) })
  expect(oldSignal.aborted).toBe(true)
  await act(async () => resolveOld("<svg><text>Stale</text></svg>"))
  expect(decodeURIComponent(host.querySelector("img")?.src ?? "")).toContain("<text>New</text>")
  expect(render.mock.calls[1][0].dark).toBe(true)
})

test("shows a safe syntax error and preserves source without export buttons", async () => {
  render.mockRejectedValue(new MermaidRenderError("render", '<img src=x onerror="bad()">'))
  await show()
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("Check the Mermaid syntax")
  expect(host.querySelector("img")).toBeNull()
  expect(host.querySelector('pre[data-markdown="mermaid-ascii"]')?.textContent).toBe(props.source)
  expect(host.textContent).not.toContain("Download SVG")
})

test("explains ASCII limitations and allows retry after a worker failure", async () => {
  render.mockRejectedValueOnce(new MermaidRenderError("asciiUnsupported"))
  await show({ source: 'pie\n"A":1', mode: "ascii" })
  expect(host.textContent).toContain("requires SVG")
  render.mockRejectedValueOnce(new MermaidRenderError("timeout"))
  await show()
  render.mockResolvedValueOnce('<svg viewBox="0 0 1 1"/>')
  const retry = [...host.querySelectorAll("button")].find((button) => button.textContent === "Retry")!
  await act(async () => retry.click())
  expect(host.querySelector("img")).not.toBeNull()
})

test("toggles source without recalculating layout and aborts on unmount", async () => {
  render.mockResolvedValue('<svg viewBox="0 0 1 1"/>')
  await show()
  const toggle = [...host.querySelectorAll("button")].find((button) => button.textContent === "Show source")!
  await act(async () => toggle.click())
  expect(host.querySelector("img")).toBeNull()
  expect(host.querySelector("pre")?.textContent).toBe(props.source)
  await act(async () => toggle.click())
  expect(host.querySelector("img")).not.toBeNull()
  expect(render).toHaveBeenCalledTimes(1)
  await act(async () => root.render(null))
  expect(render.mock.calls[0][1].aborted).toBe(true)
})

test("isolates diagram CSS and fragment references in an image document", async () => {
  render.mockResolvedValue('<svg><style>body{display:none!important}</style><use href="#hostIcon"/></svg>')
  await show()
  expect(host.querySelector("svg, style, use")).toBeNull()
  const image = host.querySelector("img")!
  expect(image.src).toMatch(/^data:image\/svg\+xml/)
  expect(decodeURIComponent(image.src)).toContain("body{display:none!important}")
  expect(image.alt).toBe(props.source)
})
