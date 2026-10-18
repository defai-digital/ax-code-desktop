import { beforeEach, expect, test, vi } from "vitest"
import { renderOfficialMermaid } from "./mermaidOfficialRenderer"
import { mermaidFixtures } from "./mermaid.fixtures"

const api = vi.hoisted(() => ({ initialize: vi.fn(), parse: vi.fn(), render: vi.fn() }))
vi.mock("mermaid", () => ({ default: api }))
const request = { source: mermaidFixtures.pie, mode: "svg" as const, colors: {}, dark: false }

beforeEach(() => {
  vi.clearAllMocks()
  api.parse.mockResolvedValue({ diagramType: "pie" })
  api.render.mockResolvedValue({ svg: '<svg viewBox="0 0 10 10" />' })
})

test("uses strict host configuration and cleans its temporary DOM on success", async () => {
  await expect(renderOfficialMermaid(request, new AbortController().signal)).resolves.toContain("<svg")
  expect(api.initialize).toHaveBeenCalledWith(
    expect.objectContaining({
      securityLevel: "strict",
      htmlLabels: false,
      startOnLoad: false,
      theme: "default",
      maxTextSize: 20_000,
      maxEdges: 300,
    }),
  )
  const container = api.render.mock.calls[0][2] as HTMLElement
  expect(container.isConnected).toBe(false)
  await renderOfficialMermaid({ ...request, dark: true }, new AbortController().signal)
  expect(api.initialize.mock.lastCall?.[0].theme).toBe("dark")
})

test("does not insert an error diagram for malformed syntax", async () => {
  api.parse.mockRejectedValueOnce(new Error("Parse error on line 2"))
  await expect(renderOfficialMermaid(request, new AbortController().signal)).rejects.toMatchObject({
    code: "render",
    message: "Parse error on line 2",
  })
  expect(api.render).not.toHaveBeenCalled()
})

test("removes temporary DOM after layout failure", async () => {
  api.render.mockRejectedValueOnce(new Error("Layout failed"))
  await expect(renderOfficialMermaid(request, new AbortController().signal)).rejects.toMatchObject({ code: "render" })
  expect((api.render.mock.calls[0][2] as HTMLElement).isConnected).toBe(false)
})

test("checks cancellation between parsing and layout", async () => {
  const controller = new AbortController()
  api.parse.mockImplementationOnce(async () => controller.abort())
  await expect(renderOfficialMermaid(request, controller.signal)).rejects.toMatchObject({ name: "AbortError" })
  expect(api.render).not.toHaveBeenCalled()
})
