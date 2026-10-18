import { afterEach, expect, test, vi } from "vitest"
import { createStreamlitProjectAction } from "./streamlitProjectAction"
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
  const action = createStreamlitProjectAction({
    id: "streamlit",
    name: "Start Streamlit",
    interpreter: ".venv/bin/python",
    entrypoint: "pages/app's file.py",
    port: "8501",
  })!
  expect(await saveProjectActionsState(project, { actions: [action], primaryActionId: null })).toBe(true)
  expect((await getProjectActionsState(project)).actions).toEqual([action])
})
