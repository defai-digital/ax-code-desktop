import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const readFile = vi.fn()

// One stable object: the hook's effect depends on `files`, and a fresh object per render re-runs the probe,
// whose setState renders again — the loop allocates until the worker dies.
const files = { readFile }

vi.doMock("@/hooks/useRuntimeAPIs", () => ({
  useRuntimeAPIs: () => ({ files }),
}))

const { useProjectKnowledge } = await import("./useProjectKnowledge")

type ProjectKnowledgeState = ReturnType<typeof useProjectKnowledge>

let latest: ProjectKnowledgeState
let container: HTMLDivElement
let root: Root | null = null

const Probe = ({ directory }: { directory: string }) => {
  latest = useProjectKnowledge(directory)
  return null
}

const mount = async (directory: string) => {
  root = createRoot(container)
  await act(async () => {
    root?.render(<Probe directory={directory} />)
  })
  await act(async () => {
    await Promise.resolve()
  })
}

describe("useProjectKnowledge positive cache", () => {
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    container = document.createElement("div")
    document.body.appendChild(container)
    readFile.mockReset()
    readFile.mockImplementation(async (path: string) => {
      if (String(path).endsWith("AGENTS.md")) return "x"
      throw new Error("ENOENT")
    })
  })

  afterEach(() => {
    root?.unmount()
    container.remove()
    vi.useRealTimers()
  })

  test("re-probes once the cached hit expires", async () => {
    // The hit was cached for the life of the renderer, so a knowledge file deleted — or a branch without it
    // — while the app stayed open left the "knowledge loaded" chip claiming something the project no longer
    // has. The chip has to correct itself.
    vi.useFakeTimers()
    await mount("/repo")
    expect(latest.exists).toBe(true)
    const probesForTheFirstMount = readFile.mock.calls.length

    // The file is gone by the time the cache expires.
    readFile.mockImplementation(async () => {
      throw new Error("ENOENT")
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(31_000)
    })

    root?.unmount()
    root = null
    await mount("/repo")

    expect(readFile.mock.calls.length).toBeGreaterThan(probesForTheFirstMount)
    expect(latest.exists).toBe(false)
  })

  test("serves a fresh hit from the cache without re-probing", async () => {
    vi.useFakeTimers()
    await mount("/repo")
    const probes = readFile.mock.calls.length
    expect(latest.exists).toBe(true)

    root?.unmount()
    root = null
    await mount("/repo")

    expect(readFile.mock.calls.length).toBe(probes)
    expect(latest.exists).toBe(true)
  })
})
