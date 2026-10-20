import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

describe("MCP config prototype keys", () => {
  let tempRoot
  let configPath
  let mcp

  beforeAll(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "oc-mcp-prototype-"))
    process.env.XDG_CONFIG_HOME = tempRoot
    vi.resetModules()
    mcp = await import("./mcp.js")

    configPath = path.join(tempRoot, "ax-code", "config.json")
    await fs.mkdir(path.dirname(configPath), { recursive: true })
    await fs.writeFile(configPath, JSON.stringify({ mcp: {} }, null, 2), "utf8")
  })

  afterAll(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true })
  })

  it("does not read an inherited prototype member as a server", () => {
    expect(mcp.getMcpConfig("constructor", null)).toBeNull()
  })

  it("refuses to update or delete a prototype key without rewriting the config", async () => {
    const before = await fs.readFile(configPath, "utf8")

    expect(() => mcp.updateMcpConfig("constructor", { type: "local" }, null)).toThrow(/not found/)
    expect(() => mcp.deleteMcpConfig("constructor", null)).toThrow(/not found/)

    expect(await fs.readFile(configPath, "utf8")).toBe(before)
  })
})
