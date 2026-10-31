import { createRequire } from "node:module"
import { describe, expect, test, vi } from "vitest"

const require = createRequire(import.meta.url)
const { createStartupDiagnostics } = require("./startup-diagnostics.js")

const LOG_PATH = "/logs/ax-code/main.log"

// Callbacks are deferred like the real fs so a record issued before an earlier
// append settled observes the flag state the production code really has.
const fakeFs = ({ size = 0, appendError = null, renameError = null } = {}) => {
  const appended = []
  return {
    appended,
    mkdirSync: vi.fn(),
    appendFile: vi.fn((_path, line, callback) => {
      appended.push(line)
      queueMicrotask(() => callback(appendError))
    }),
    stat: vi.fn((_path, callback) => queueMicrotask(() => callback(null, { size }))),
    rename: vi.fn((_from, _to, callback) => queueMicrotask(() => callback(renameError))),
    truncate: vi.fn((_path, _length, callback) => queueMicrotask(() => callback(null))),
  }
}

const flush = async () => {
  for (let index = 0; index < 4; index += 1) await Promise.resolve()
}

describe("startup diagnostics log", () => {
  test("creates the log directory once for many events", () => {
    const fs = fakeFs()
    const diagnostics = createStartupDiagnostics({ logPath: LOG_PATH, fs })
    for (let index = 0; index < 5; index += 1) {
      diagnostics.record("renderer.console", { level: "warning", index })
    }
    expect(fs.mkdirSync).toHaveBeenCalledTimes(1)
    expect(fs.mkdirSync).toHaveBeenCalledWith("/logs/ax-code", { recursive: true })
    expect(fs.appendFile).toHaveBeenCalledTimes(5)
    expect(fs.appended[4]).toContain('"index":4')
  })

  test("re-creates the log directory after an append fails", async () => {
    const fs = fakeFs({ appendError: new Error("ENOENT") })
    const diagnostics = createStartupDiagnostics({ logPath: LOG_PATH, fs })
    diagnostics.record("first")
    diagnostics.record("second")
    // The second record ran before the first append reported its failure.
    expect(fs.mkdirSync).toHaveBeenCalledTimes(1)
    await flush()
    diagnostics.record("third")
    expect(fs.mkdirSync).toHaveBeenCalledTimes(2)
  })

  test("checks the inherited log on the first append, then every 128 appends, and rotates it past the cap", async () => {
    const fs = fakeFs({ size: 3 * 1024 * 1024 })
    const diagnostics = createStartupDiagnostics({ logPath: LOG_PATH, fs })
    diagnostics.record("app.start")
    await flush()
    expect(fs.stat).toHaveBeenCalledTimes(1)
    expect(fs.rename).toHaveBeenCalledTimes(1)
    expect(fs.rename.mock.calls[0].slice(0, 2)).toEqual([LOG_PATH, `${LOG_PATH}.1`])
    for (let index = 0; index < 127; index += 1) diagnostics.record("renderer.console", { index })
    await flush()
    expect(fs.stat).toHaveBeenCalledTimes(1)
    diagnostics.record("renderer.console", { index: 127 })
    await flush()
    expect(fs.stat).toHaveBeenCalledTimes(2)
    expect(fs.truncate).not.toHaveBeenCalled()
  })

  test("truncates the log when the rotation rename fails", async () => {
    const fs = fakeFs({ size: 3 * 1024 * 1024, renameError: new Error("EBUSY") })
    const diagnostics = createStartupDiagnostics({ logPath: LOG_PATH, fs })
    diagnostics.record("app.start")
    await flush()
    expect(fs.rename).toHaveBeenCalledTimes(1)
    expect(fs.truncate).toHaveBeenCalledTimes(1)
    expect(fs.truncate.mock.calls[0].slice(0, 2)).toEqual([LOG_PATH, 0])
  })

  test("leaves a log under the cap in place", async () => {
    const fs = fakeFs({ size: 1024 })
    const diagnostics = createStartupDiagnostics({ logPath: LOG_PATH, fs, maxLogBytes: 2048 })
    // Appends are spread over time in the app; a check in flight skips the next trigger.
    for (const batch of [1, 128, 128]) {
      for (let index = 0; index < batch; index += 1) diagnostics.record("renderer.console", { index })
      await flush()
    }
    expect(fs.stat).toHaveBeenCalledTimes(3)
    expect(fs.rename).not.toHaveBeenCalled()
    expect(fs.truncate).not.toHaveBeenCalled()
  })

  test("writes nothing without a log path", () => {
    const fs = fakeFs()
    const diagnostics = createStartupDiagnostics({ fs })
    diagnostics.record("event")
    expect(fs.mkdirSync).not.toHaveBeenCalled()
    expect(fs.appendFile).not.toHaveBeenCalled()
  })
})
