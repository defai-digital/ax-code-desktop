import { createRequire } from "node:module"
import { describe, expect, test } from "vitest"

const require = createRequire(import.meta.url)
const { buildOpenFileSpecs, buildOpenProjectSpecs } = require("./open-app-specs")

describe("macOS open-in launch candidates", () => {
  test("hands a project folder to AkiTTY with open -a, which starts a shell in that folder", () => {
    expect(buildOpenProjectSpecs({ projectPath: "/work/repo", appId: "akitty", appName: "Akitty" })).toEqual([
      { program: "open", args: ["-a", "Akitty", "/work/repo"] },
    ])
  })

  test("opens a file's folder in a terminal app instead of the file itself", () => {
    for (const [appId, appName] of [
      ["akitty", "Akitty"],
      ["ghostty", "Ghostty"],
      ["terminal", "Terminal"],
    ]) {
      expect(buildOpenFileSpecs({ filePath: "/work/repo/src/main.ts", appId, appName })).toEqual([
        { program: "open", args: ["-a", appName, "/work/repo/src"] },
      ])
    }
  })

  test("keeps editor CLI and JetBrains fallbacks ahead of plain open -a", () => {
    expect(buildOpenProjectSpecs({ projectPath: "/work/repo", appId: "vscode", appName: "Visual Studio Code" })).toEqual([
      { program: "code", args: ["-n", "/work/repo"] },
      { program: "open", args: ["-a", "Visual Studio Code", "/work/repo"] },
    ])
    expect(buildOpenFileSpecs({ filePath: "/work/a.py", appId: "pycharm", appName: "PyCharm" })).toEqual([
      { program: "open", args: ["-na", "PyCharm", "--args", "/work/a.py"] },
      { program: "open", args: ["-a", "PyCharm", "/work/a.py"] },
    ])
    expect(buildOpenFileSpecs({ filePath: "/work/a.py", appId: "finder", appName: "Finder" })).toEqual([
      { program: "open", args: ["-R", "/work/a.py"] },
    ])
  })
})
