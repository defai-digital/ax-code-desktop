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

  it("refuses a server it could never start and drops wrong-typed fields", async () => {
    // A local server with no command, or a remote one with no URL, was written and reported created.
    await fsPromises.writeFile(path.join(tempRoot, "ax-code.json"), "{}", "utf8")
    expect(() => createMcpConfig("empty", {}, tempRoot, "project")).toThrow("is required")
    expect(() => createMcpConfig("remote", { type: "remote" }, tempRoot, "project")).toThrow("is required")

    createMcpConfig(
      "typed",
      { type: "remote", url: "https://mcp.example.com", headers: "Authorization: x", timeout: "30s", environment: "A=b" },
      tempRoot,
      "project",
    )

    const written = JSON.parse(await fsPromises.readFile(path.join(tempRoot, "ax-code.json"), "utf8"))
    expect(written.mcp.typed).toEqual({ type: "remote", url: "https://mcp.example.com", enabled: true })
    expect(written.mcp.empty).toBeUndefined()
  })

  it("still lists a saved entry that has no command, so it can be fixed", async () => {
    await fsPromises.writeFile(
      path.join(tempRoot, "ax-code.json"),
      JSON.stringify({ mcp: { broken: { type: "local" } } }),
      "utf8",
    )

    expect(listMcpConfigs(tempRoot).map((entry) => entry.name)).toContain("broken")
  })
})
