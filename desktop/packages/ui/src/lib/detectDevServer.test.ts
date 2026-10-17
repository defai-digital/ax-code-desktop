import { afterEach, describe, expect, test, vi } from "vitest"

const stubFiles = (contents: Record<string, string>) => {
  vi.doMock("@/contexts/runtimeAPIRegistry", () => ({
    getRegisteredRuntimeAPIs: () => ({
      files: {
        readFile: async (path: string, options?: { optional?: boolean }) =>
          path in contents ? { content: contents[path] } : options?.optional ? null : null,
      },
    }),
  }))
}

describe("detectDevServerCommand", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.doUnmock("@/contexts/runtimeAPIRegistry")
    vi.resetModules()
  })

  test("serves a static preview on loopback only", async () => {
    // `python3 -m http.server` listens on every interface unless it is told otherwise, and this serves the project
    // directory as it stands — `.git`, `.env` and any credential file in it — so anyone on the same network could
    // fetch them. The command's own `previewUrlHint` says loopback, which is what it has to bind.
    stubFiles({ "/project/index.html": "<html></html>" })
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ port: 4321 }) })),
    )

    const { detectDevServerCommand } = await import("./detectDevServer")
    const detected = await detectDevServerCommand("/project", [], null)

    expect(detected?.command).toBe("python3 -m http.server 4321 --bind 127.0.0.1")
    expect(detected?.previewUrlHint).toBe("http://127.0.0.1:4321/")
  })
})
