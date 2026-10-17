import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import type { HookWorkspace } from "@defai-digital/ax-code-sdk/v2"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

import { I18nProvider } from "@/lib/i18n"
import { axCodeClient } from "@/lib/ax-code/client"
import { useDirectoryStore } from "@/stores/useDirectoryStore"
import { useProjectsStore } from "@/stores/useProjectsStore"
import { useUIStore } from "@/stores/useUIStore"

import { HooksPage } from "./HooksPage"

const DIRECTORY = "/repo/app"
const HOOKS_PATH = "/repo/app/.ax-code/hooks.json"
const longCommand = `npx prettier --write ${"src/file.ts ".repeat(8)}`

const trustedWorkspace: HookWorkspace = {
  trusted: true,
  file: { path: HOOKS_PATH, exists: true, valid: true },
  hooks: [
    {
      event: "PreToolUse",
      matcher: "Bash",
      command: longCommand,
      protocol: "claude-code",
      blockOnFailure: true,
      source: "project",
    },
    {
      event: "PostToolUse",
      command: "echo done",
      source: "pack",
      pack: "format",
    },
  ],
  packs: [
    { name: "format", description: "Format changed files", enabled: true },
    { name: "lint", description: "Run the linter", enabled: false },
  ],
}

const hooksGet = vi.fn()
let container: HTMLDivElement
let root: Root

const text = () => document.body.textContent ?? ""
const button = (label: string) =>
  Array.from(document.body.querySelectorAll("button")).find((entry) => entry.textContent?.trim() === label) ?? null

const flush = async () => {
  for (let i = 0; i < 8; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
}

const renderPage = async () => {
  await act(async () => {
    root.render(
      <I18nProvider>
        <HooksPage />
      </I18nProvider>,
    )
  })
  await flush()
}

beforeEach(() => {
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  hooksGet.mockReset()
  vi.spyOn(axCodeClient, "getScopedSdkClient").mockReturnValue({ hooks: { get: hooksGet } } as never)
  useDirectoryStore.setState({ currentDirectory: DIRECTORY })
  useProjectsStore.setState({ projects: [], activeProjectId: null })
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.restoreAllMocks()
})

describe("HooksPage", () => {
  test("warns that an untrusted hooks file is ignored", async () => {
    const openContextFile = vi.fn()
    useUIStore.setState({ openContextFile })
    hooksGet.mockResolvedValue({
      data: {
        trusted: false,
        file: { path: HOOKS_PATH, exists: true, valid: true },
        hooks: [],
        packs: [],
      } satisfies HookWorkspace,
    })

    await renderPage()

    expect(text()).toContain("start AX Code with AX_CODE_TRUST_PROJECT_CONFIG=1 after reviewing the hooks.")
    expect(text()).toContain("Valid")
    expect(text()).toContain(HOOKS_PATH)
    expect(text()).toContain("No hooks are in effect.")
    expect(axCodeClient.getScopedSdkClient).toHaveBeenCalledWith(DIRECTORY)
    expect(hooksGet).toHaveBeenCalledWith({ directory: DIRECTORY }, { throwOnError: true })
    expect(document.querySelectorAll("input, textarea, [role='switch']")).toHaveLength(0)

    await act(async () => {
      button("Open file")?.click()
    })
    expect(openContextFile).toHaveBeenCalledWith(DIRECTORY, HOOKS_PATH)
  })

  test("shows trusted hooks in returned order with pack status", async () => {
    hooksGet.mockResolvedValue({ data: trustedWorkspace })

    await renderPage()

    const body = text()
    expect(body).not.toContain("AX_CODE_TRUST_PROJECT_CONFIG=1")
    expect(body.indexOf("PreToolUse")).toBeGreaterThan(-1)
    expect(body.indexOf("PreToolUse")).toBeLessThan(body.indexOf("PostToolUse"))
    expect(body).toContain("Bash")
    expect(body).toContain("all tools")
    expect(body).toContain("claude-code")
    expect(body).toContain("Block on failure")
    expect(body).toContain("Project")
    expect(body).toContain("format")
    expect(body).toContain("Format changed files")
    expect(body).toContain("Enabled")
    expect(body).toContain("Disabled")
    expect(body).toContain('Packs are enabled from the "packs" field in .ax-code/hooks.json.')
    expect(document.querySelector(`code[title="${longCommand}"]`)).not.toBeNull()

    await act(async () => {
      button("Show full command")?.click()
    })
    expect(button("Hide full command")?.getAttribute("aria-expanded")).toBe("true")

    await act(async () => {
      button("Refresh")?.click()
    })
    await flush()
    expect(hooksGet).toHaveBeenCalledTimes(2)
  })

  test("shows an invalid hooks file error", async () => {
    hooksGet.mockResolvedValue({
      data: {
        trusted: true,
        file: { path: HOOKS_PATH, exists: true, valid: false, error: "expected object at packs" },
        hooks: [],
        packs: [],
      } satisfies HookWorkspace,
    })

    await renderPage()

    expect(text()).toContain("Invalid")
    expect(text()).toContain("expected object at packs")
    expect(text()).not.toContain("AX_CODE_TRUST_PROJECT_CONFIG=1")
  })

  test("shows a neutral note when the hooks file is missing", async () => {
    hooksGet.mockResolvedValue({
      data: {
        trusted: false,
        file: { path: HOOKS_PATH, exists: false, valid: false },
        hooks: [],
        packs: [],
      } satisfies HookWorkspace,
    })

    await renderPage()

    expect(text()).toContain("Missing")
    expect(text()).toContain("No project hooks file was found for this directory.")
    expect(text()).not.toContain("AX_CODE_TRUST_PROJECT_CONFIG=1")
    expect(text()).toContain("No hooks are in effect.")
  })

  test("retries after a request error", async () => {
    hooksGet.mockRejectedValueOnce(new Error("network down"))

    await renderPage()

    expect(text()).toContain("Could not load hooks.")
    expect(text()).toContain("network down")
    expect(text()).not.toContain("Hooks file")

    hooksGet.mockResolvedValue({ data: trustedWorkspace })
    await act(async () => {
      button("Retry")?.click()
    })
    await flush()

    expect(text()).toContain("PreToolUse")
    expect(text()).not.toContain("network down")
  })
})
