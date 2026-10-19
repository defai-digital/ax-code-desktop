import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { RuntimeAPIContext } from "@/contexts/runtimeAPIContext"
import type { FilesAPI, RuntimeAPIs } from "@/lib/api/types"
import { RuntimeAPIProvider } from "./RuntimeAPIProvider"

let runtimeFiles: FilesAPI | null = null

const FilesProbe = () => {
  runtimeFiles = React.useContext(RuntimeAPIContext)?.files ?? null
  return null
}

describe("RuntimeAPIProvider file content cache", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    runtimeFiles = null
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.restoreAllMocks()
  })

  const renderFiles = (files: FilesAPI) => {
    act(() => {
      root.render(
        <RuntimeAPIProvider apis={{ files } as unknown as RuntimeAPIs}>
          <FilesProbe />
        </RuntimeAPIProvider>,
      )
    })
  }

  test("an optional read of a missing file resolves with empty content on a cache miss", async () => {
    // `optional: true` makes an absent file a successful empty read in the server API. Dropping the
    // option on the cache-miss path turned it into the stat/read 404 error instead.
    const readFile = vi.fn(async (path: string, options?: { optional?: boolean }) => {
      if (options?.optional) return { content: "", path }
      throw new Error("404 File not found")
    })
    const statFile = vi.fn(async () => {
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" })
    })
    renderFiles({ readFile, statFile } as unknown as FilesAPI)

    await expect(runtimeFiles!.readFile!("/missing.txt", { optional: true })).resolves.toEqual({
      content: "",
      path: "/missing.txt",
    })
    expect(readFile).toHaveBeenCalledWith("/missing.txt", { optional: true })
  })

  test("an optional read keeps the option when a stale cache entry is discarded", async () => {
    let mtimeMs = 1
    const readFile = vi.fn(async (path: string, options?: { optional?: boolean }) => {
      if (options?.optional) return { content: "", path }
      return { content: "stale", path }
    })
    const statFile = vi.fn(async (path: string) => ({ path, isFile: true, size: 5, mtimeMs }))
    renderFiles({ readFile, statFile } as unknown as FilesAPI)

    await runtimeFiles!.readFile!("/cached.txt")
    expect(readFile).toHaveBeenCalledTimes(1)

    mtimeMs = 2
    await expect(runtimeFiles!.readFile!("/cached.txt", { optional: true })).resolves.toEqual({
      content: "",
      path: "/cached.txt",
    })
    expect(readFile).toHaveBeenLastCalledWith("/cached.txt", { optional: true })
  })
})
