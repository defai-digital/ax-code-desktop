import fs from "fs"
import os from "os"
import path from "path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { readJsonFile } from "./auth.js"

describe("quota auth utilities", () => {
  let tempRoot

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ax-code-quota-auth-"))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    fs.rmSync(tempRoot, { recursive: true, force: true })
  })

  const testFile = (name) => path.join(tempRoot, name)

  it("reads JSON files without a preflight existence check", () => {
    const filePath = testFile("auth.json")
    fs.writeFileSync(filePath, JSON.stringify({ accounts: [{ refreshToken: "token" }] }), "utf8")
    const existsSync = vi.spyOn(fs, "existsSync").mockImplementation((candidate) => {
      if (candidate === filePath) {
        throw new Error("readJsonFile should not call existsSync before reading")
      }
      return false
    })

    try {
      expect(readJsonFile(filePath)).toEqual({ accounts: [{ refreshToken: "token" }] })
    } finally {
      existsSync.mockRestore()
    }
  })

  it("treats missing and empty JSON files as absent auth", () => {
    const emptyPath = testFile("empty.json")
    fs.writeFileSync(emptyPath, "  \n", "utf8")

    expect(readJsonFile(testFile("missing.json"))).toBeNull()
    expect(readJsonFile(emptyPath)).toBeNull()
  })

  it("returns null for invalid JSON", () => {
    const filePath = testFile("invalid.json")
    fs.writeFileSync(filePath, "{not-json", "utf8")
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})

    expect(readJsonFile(filePath)).toBeNull()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("Failed to read JSON file:"), expect.any(SyntaxError))
  })

  it("resolves the antigravity accounts under the configured XDG directories", async () => {
    // The module defaulted to `~/.config` and `~/.local/share` while ax-code resolves both through
    // xdg-basedir (`ax-code/shared.js`, `ax-code/auth.js`), so with a customised XDG path the accounts file was
    // read from the wrong directory and the Antigravity source silently disappeared from the Google card.
    const previousData = process.env.XDG_DATA_HOME
    const previousConfig = process.env.XDG_CONFIG_HOME
    process.env.XDG_DATA_HOME = tempRoot
    process.env.XDG_CONFIG_HOME = tempRoot
    fs.mkdirSync(path.join(tempRoot, "ax-code"), { recursive: true })
    fs.writeFileSync(
      path.join(tempRoot, "ax-code", "antigravity-accounts.json"),
      JSON.stringify({ accounts: [{ refreshToken: "refresh-token|project-1" }], activeIndex: 0 }),
      "utf8",
    )
    vi.resetModules()

    try {
      const { ANTIGRAVITY_ACCOUNTS_PATHS } = await import("./auth.js")
      expect(ANTIGRAVITY_ACCOUNTS_PATHS).toContain(path.join(tempRoot, "ax-code", "antigravity-accounts.json"))

      const { resolveAntigravityAuth } = await import("../providers/google/auth.js")
      expect(resolveAntigravityAuth()).toMatchObject({ sourceId: "antigravity", projectId: "project-1" })
    } finally {
      if (previousData === undefined) delete process.env.XDG_DATA_HOME
      else process.env.XDG_DATA_HOME = previousData
      if (previousConfig === undefined) delete process.env.XDG_CONFIG_HOME
      else process.env.XDG_CONFIG_HOME = previousConfig
      vi.resetModules()
    }
  })
})
