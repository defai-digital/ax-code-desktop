import { readFile } from "node:fs/promises"
import path from "node:path"
import { describe, expect, test } from "vitest"

describe("opening a path in the app the caller named", () => {
  test("Windows honours the app name instead of opening with the default handler", async () => {
    const mainSource = await readFile(path.join(import.meta.dirname, "main.js"), "utf8")
    const handler = mainSource.match(/handleCommand\("desktop_open_path"(?<body>[\s\S]*?)\n\}\)/)?.groups?.body

    expect(handler).toBeDefined()
    // The name was only used on macOS: on Windows the path went to whatever owns it — Explorer for a
    // folder — and the handler answered success, so the renderer that fell back here after
    // `desktop_open_in_app` failed stopped offering the choice the user had made.
    expect(handler).toContain("process.platform === \"win32\" && appName")
    expect(handler).toContain("buildWindowsOpenProjectSpecs({ projectPath: targetPath, appId: \"\", appName })")
    expect(handler).toContain("await runSpecChain(")
  })
})
