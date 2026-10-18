import { afterEach, expect, test, vi } from "vitest"
vi.mock("./desktop", () => ({ getDesktopHomeDirectory: async () => "/home/user" }))
import { getProjectActionsState, saveProjectActionsState } from "./openchamberConfig"

afterEach(() => {
  vi.unstubAllGlobals()
  delete window.__AX_CODE_DESKTOP_RUNTIME_APIS__
})

test("persists and reads recipe quoting, preview readiness, and shell restriction", async () => {
  const files = new Map<string, string>()
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw Error("offline")
    }),
  )
  Object.assign(window, {
    __AX_CODE_DESKTOP_RUNTIME_APIS__: {
      files: {
        readFile: async (path: string) => {
          if (!files.has(path)) throw Error("ENOENT")
          return { content: files.get(path), path }
        },
        writeFile: async (path: string, content: string) => {
          files.set(path, content)
          return { success: true, path }
        },
        createDirectory: async (path: string) => ({ success: true, path }),
      },
    },
  })
  const project = { id: "recipe-fixture", path: "/repo" }
  const action = {
    id: "legacy",
    name: "My app",
    command: "python -m streamlit run 'streamlit_app.py'",
    shell: "posix" as const,
    autoOpenUrl: true,
    waitForUrl: true,
    streamlit: { version: 1, entrypoint: "streamlit_app.py", interpreter: "/env with space/bin/python", port: 9007 },
  }
  expect(await saveProjectActionsState(project, { actions: [action], primaryActionId: action.id })).toBe(true)
  const first = await getProjectActionsState(project)
  expect(first.primaryActionId).toBe(action.id)
  expect(first.actions[0]).not.toHaveProperty("streamlit")
  expect(first.actions[0].command).toContain("'/env with space/bin/python'")
  expect(first.actions[0].command).toContain("--server.port=9007")
  expect(first.actions[0]).toMatchObject({ shell: "posix", autoOpenUrl: true, waitForUrl: true })
  expect(await saveProjectActionsState(project, first)).toBe(true)
  expect(await getProjectActionsState(project)).toEqual(first)
})
