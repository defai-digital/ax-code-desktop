import fsPromises from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { createMcpConfig, getMcpConfig, listMcpConfigs } from "./mcp.js"

describe("project-scoped MCP config writes", () => {
  let tempRoot

  beforeEach(async () => {
    tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), "oc-mcp-config-"))
  })

  afterEach(async () => {
    await fsPromises.rm(tempRoot, { recursive: true, force: true })
  })

  it("writes into the project config file that the readers resolve", async () => {
    const rootConfigPath = path.join(tempRoot, "ax-code.json")
    await fsPromises.writeFile(rootConfigPath, "{}", "utf8")

    createMcpConfig("flightsearch", { type: "local", command: ["npx", "-y", "mcp"] }, tempRoot, "project")

    const written = JSON.parse(await fsPromises.readFile(rootConfigPath, "utf8"))
    expect(written.mcp.flightsearch.command).toEqual(["npx", "-y", "mcp"])
    expect(getMcpConfig("flightsearch", tempRoot)).not.toBeNull()
    await expect(fsPromises.stat(path.join(tempRoot, ".ax-code", "ax-code.json"))).rejects.toThrow()
  })

  it("keeps a newly created project server visible to the listings", () => {
    createMcpConfig("flightsearch", { type: "local", command: ["npx", "-y", "mcp"] }, tempRoot, "project")

    expect(listMcpConfigs(tempRoot).map((entry) => entry.name)).toContain("flightsearch")
    expect(getMcpConfig("flightsearch", tempRoot)).toMatchObject({ scope: "project" })
  })
})
