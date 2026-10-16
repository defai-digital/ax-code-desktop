import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

vi.doMock("@/lib/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }))

const { McpResourceBrowser } = await import("./McpResourceBrowser")
const { useMcpStore } = await import("@/stores/useMcpStore")

const resource = {
  client: "server-a",
  name: "notes",
  uri: "memory://notes",
  mimeType: "text/plain",
}

// Stable identity: the component selects this through the store, so a fresh object per call makes
// React re-render forever.
const resourceMap = { [resource.uri]: resource }

const deferred = <T,>() => {
  let resolve: (value: T) => void = () => {}
  const promise = new Promise<T>((settle) => {
    resolve = settle
  })
  return { promise, resolve }
}

describe("McpResourceBrowser preview staleness", () => {
  let container: HTMLDivElement
  let root: Root
  let readResource: ReturnType<typeof vi.fn>

  const render = (directory: string) => {
    act(() =>
      root.render(<McpResourceBrowser serverName="server-a" directory={directory} connected />),
    )
  }

  const selectResource = () => {
    act(() => {
      const button = Array.from(container.querySelectorAll("button")).find((candidate) =>
        candidate.textContent?.includes("notes"),
      )
      button?.click()
    })
  }

  const previewText = () => container.textContent ?? ""

  beforeEach(() => {
    readResource = vi.fn()
    useMcpStore.setState({
      getResourcesForDirectory: () => resourceMap as never,
      getResourceErrorForDirectory: () => null,
      refreshResources: vi.fn(async () => {}),
      readResource: (...args: never[]) => readResource(...args),
    } as never)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    document.body.replaceChildren()
    vi.restoreAllMocks()
  })

  test("keeps an earlier project's answer out of the next project's preview", async () => {
    // A URI alone cannot tell the two reads apart: the same resource can be read under another
    // project, and the first answer then arrives as the second project's preview.
    const first = deferred<{ contents: Array<{ uri: string; text: string }> }>()
    const second = deferred<{ contents: Array<{ uri: string; text: string }> }>()
    readResource.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)

    render("/project-one")
    selectResource()

    render("/project-two")
    selectResource()

    await act(async () => {
      first.resolve({ contents: [{ uri: resource.uri, text: "from project one" }] })
      await Promise.resolve()
    })

    expect(previewText()).not.toContain("from project one")

    await act(async () => {
      second.resolve({ contents: [{ uri: resource.uri, text: "from project two" }] })
      await Promise.resolve()
    })

    expect(previewText()).toContain("from project two")
  })

  test("shows the answer of the resource that is selected last", async () => {
    const first = deferred<{ contents: Array<{ uri: string; text: string }> }>()
    const second = deferred<{ contents: Array<{ uri: string; text: string }> }>()
    readResource.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)

    render("/project-one")
    selectResource()
    selectResource()

    await act(async () => {
      second.resolve({ contents: [{ uri: resource.uri, text: "second read" }] })
      await Promise.resolve()
    })
    await act(async () => {
      first.resolve({ contents: [{ uri: resource.uri, text: "first read" }] })
      await Promise.resolve()
    })

    expect(previewText()).toContain("second read")
    expect(previewText()).not.toContain("first read")
  })
})
