import { createRequire } from "node:module"
import { describe, expect, it, vi } from "vitest"

const require = createRequire(import.meta.url)
const { recoverFromMissingRuntime } = require("./runtime-missing-recovery.js")

// buttons: 0 = Choose, 1 = Open install guide, 2 = Quit
const setup = ({ responses, picks = [], executable = true }) => {
  const queue = [...responses]
  const pickQueue = [...picks]
  const dialog = {
    showMessageBox: vi.fn(async () => ({ response: queue.shift() ?? 2 })),
    showOpenDialog: vi.fn(async () => pickQueue.shift() ?? { canceled: true, filePaths: [] }),
  }
  const deps = {
    dialog,
    openExternal: vi.fn(async () => {}),
    installDocsUrl: "https://example.test/install",
    isExecutable: vi.fn(() => executable),
    saveBinaryPath: vi.fn(async () => {}),
    logger: { warn: vi.fn() },
  }
  return { deps, dialog }
}

describe("recoverFromMissingRuntime", () => {
  it("saves the chosen executable and asks the caller to retry", async () => {
    const { deps } = setup({ responses: [0], picks: [{ canceled: false, filePaths: ["/opt/bin/ax-code"] }] })
    await expect(recoverFromMissingRuntime(deps)).resolves.toBe("retry")
    expect(deps.saveBinaryPath).toHaveBeenCalledWith("/opt/bin/ax-code")
  })

  it("quits without saving anything", async () => {
    const { deps } = setup({ responses: [2] })
    await expect(recoverFromMissingRuntime(deps)).resolves.toBe("quit")
    expect(deps.saveBinaryPath).not.toHaveBeenCalled()
  })

  it("opens the install guide and shows the prompt again", async () => {
    const { deps, dialog } = setup({ responses: [1, 2] })
    await expect(recoverFromMissingRuntime(deps)).resolves.toBe("quit")
    expect(deps.openExternal).toHaveBeenCalledWith("https://example.test/install")
    expect(dialog.showMessageBox).toHaveBeenCalledTimes(2)
  })

  it("returns to the prompt when the file picker is cancelled", async () => {
    const { deps } = setup({ responses: [0, 2] })
    await expect(recoverFromMissingRuntime(deps)).resolves.toBe("quit")
    expect(deps.saveBinaryPath).not.toHaveBeenCalled()
  })

  it("rejects a file that is not executable instead of saving it", async () => {
    const { deps, dialog } = setup({
      responses: [0, 2],
      picks: [{ canceled: false, filePaths: ["/tmp/notes.txt"] }],
      executable: false,
    })
    await expect(recoverFromMissingRuntime(deps)).resolves.toBe("quit")
    expect(deps.saveBinaryPath).not.toHaveBeenCalled()
    expect(dialog.showMessageBox.mock.calls.some(([options]) => options.type === "error")).toBe(true)
  })

  it("keeps prompting when the install guide cannot be opened", async () => {
    const { deps } = setup({ responses: [1, 2] })
    deps.openExternal.mockRejectedValueOnce(new Error("no browser"))
    await expect(recoverFromMissingRuntime(deps)).resolves.toBe("quit")
    expect(deps.logger.warn).toHaveBeenCalled()
  })
})
