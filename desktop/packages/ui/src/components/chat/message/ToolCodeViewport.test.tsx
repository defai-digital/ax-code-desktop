import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { I18nProvider } from "@/lib/i18n"
import { ToolCodeViewport } from "./ToolCodeViewport"

const actions = vi.hoisted(() => ({ copy: vi.fn(), download: vi.fn(), pool: {} as object | undefined, workerStyle: vi.fn() }))
vi.mock("@/contexts/DiffWorkerProvider", () => ({ useWorkerPool: (style: string) => { actions.workerStyle(style); return actions.pool } }))
vi.mock("@/lib/clipboard", () => ({ copyTextToClipboard: actions.copy }))
vi.mock("./toolOutputText", async (original) => ({
  ...await original<typeof import("./toolOutputText")>(), downloadToolOutput: actions.download,
}))
vi.mock("@pierre/diffs/react", async () => {
  const React = await import("react")
  return { WorkerPoolContext: React.createContext<unknown>(undefined), Virtualizer: ({ children, style, config }: {
    children: React.ReactNode; style: React.CSSProperties; config: { overscrollSize: number }
  }) => <div data-pierre-virtualizer data-overscroll={config.overscrollSize} style={style}>{children}</div> }
})

let container: HTMLDivElement
let root: Root
const source = "const fixture = '<script>literal text</script>';\r\n".repeat(4000)
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  actions.copy.mockReset().mockResolvedValue({ ok: true })
  actions.download.mockReset()
  actions.pool = {}
  actions.workerStyle.mockReset()
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})
const render = (text = source) => act(() => root.render(
  <I18nProvider><ToolCodeViewport source={text}><div data-file-content>File renderer</div></ToolCodeViewport></I18nProvider>,
))

test("leaves small renderers without a nested viewport", () => {
  render("small file")
  expect(container.querySelector("[data-pierre-virtualizer]")).toBeNull()
  expect(container.querySelector("[data-file-content]")).not.toBeNull()
})

test("places large renderers inside a bounded Pierre viewport", () => {
  render()
  const viewport = container.querySelector<HTMLElement>("[data-pierre-virtualizer]")!
  expect(viewport.style.height).toBe("60vh")
  expect(viewport.style.overflow).toBe("auto")
  expect(viewport.dataset.overscroll).toBe("400")
  expect(viewport.querySelector("[data-file-content]")).not.toBeNull()
})

test("copies the entire unchanged source", async () => {
  render()
  await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="Copy output"]')!.click())
  expect(actions.copy).toHaveBeenCalledWith(source)
})

test("downloads the entire unchanged source", () => {
  render()
  act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Download output"]')!.click())
  expect(actions.download).toHaveBeenCalledWith(source)
})

test("source actions follow changed file content", async () => {
  render()
  render(source + "final line")
  await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="Copy output"]')!.click())
  expect(actions.copy).toHaveBeenCalledWith(source + "final line")
})


test("keeps the complete source accessible before the worker pool exists", async () => {
  actions.pool = undefined
  render()
  expect(container.querySelector("[data-file-content]")).toBeNull()
  expect(container.querySelector('[data-tool-output="virtualized"]')).not.toBeNull()
  await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="Copy output"]')!.click())
  expect(actions.copy).toHaveBeenCalledWith(source)
})

test("requests the matching pool when switching diff modes", () => {
  const show = (style: "unified" | "split") => act(() => root.render(
    <I18nProvider><ToolCodeViewport source={source} diffStyle={style}><div>Diff</div></ToolCodeViewport></I18nProvider>,
  ))
  show("unified")
  expect(actions.workerStyle).toHaveBeenLastCalledWith("unified")
  show("split")
  expect(actions.workerStyle).toHaveBeenLastCalledWith("split")
})
