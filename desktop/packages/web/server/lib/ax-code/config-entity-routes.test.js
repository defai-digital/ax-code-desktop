import { describe, expect, it, vi } from "vitest"
import express from "express"
import request from "supertest"

import { registerConfigEntityRoutes } from "./config-entity-routes.js"

const createApp = (overrides = {}) => {
  const app = express()
  app.use(express.json())

  registerConfigEntityRoutes(app, {
    resolveProjectDirectory: vi.fn(async () => ({ directory: "/tmp/project", error: null })),
    resolveOptionalProjectDirectory: vi.fn(async () => ({ directory: "/tmp/project", error: null })),
    refreshAxCodeAfterConfigChange: vi.fn(async () => undefined),
    clientReloadDelayMs: 25,
    getAgentSources: vi.fn(() => ({})),
    getAgentConfig: vi.fn(() => ({})),
    createAgent: vi.fn(),
    updateAgent: vi.fn(),
    deleteAgent: vi.fn(),
    getCommandSources: vi.fn(() => ({})),
    createCommand: vi.fn(),
    updateCommand: vi.fn(),
    deleteCommand: vi.fn(),
    listMcpConfigs: vi.fn(() => []),
    getMcpConfig: vi.fn(() => null),
    createMcpConfig: vi.fn(),
    updateMcpConfig: vi.fn(),
    deleteMcpConfig: vi.fn(),
    listSnippets: vi.fn(() => []),
    getSnippet: vi.fn(() => null),
    createSnippet: vi.fn(),
    updateSnippet: vi.fn(),
    deleteSnippet: vi.fn(),
    expandSnippets: vi.fn((text) => text),
    ...overrides,
  })

  return app
}

// The MCP mutations go through the same client-error mapping as agents,
// commands and snippets: a missing server, a name conflict or a rejected name
// is the caller's error, not a server failure.
describe("MCP config route statuses", () => {
  it("answers a name conflict with 409", async () => {
    const app = createApp({
      createMcpConfig: vi.fn(() => {
        throw new Error('MCP server "existing" already exists')
      }),
    })

    const response = await request(app).post("/api/config/mcp/existing").send({ command: "npx" })

    expect(response.status).toBe(409)
    expect(response.body.error).toBe('MCP server "existing" already exists')
  })

  it("answers a rejected name with 400", async () => {
    const app = createApp({
      createMcpConfig: vi.fn(() => {
        throw new Error("MCP server name must be lowercase alphanumeric with hyphens/underscores")
      }),
    })

    const response = await request(app).post("/api/config/mcp/Not-Valid").send({})

    expect(response.status).toBe(400)
  })

  it("answers a missing server with 404 on update and delete", async () => {
    const notFound = () => {
      throw new Error('MCP server "gone" not found')
    }

    const patchResponse = await request(createApp({ updateMcpConfig: vi.fn(notFound) }))
      .patch("/api/config/mcp/gone")
      .send({ command: "npx" })
    expect(patchResponse.status).toBe(404)

    const deleteResponse = await request(createApp({ deleteMcpConfig: vi.fn(notFound) })).delete("/api/config/mcp/gone")
    expect(deleteResponse.status).toBe(404)
  })

  it("still reports 500 for an unexpected mutation failure", async () => {
    const app = createApp({
      createMcpConfig: vi.fn(() => {
        throw new Error("EACCES: permission denied")
      }),
    })

    const response = await request(app).post("/api/config/mcp/broken").send({})

    expect(response.status).toBe(500)
  })
})
