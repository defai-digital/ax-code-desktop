import { describe, expect, test, vi } from "vitest"
import express from "express"
import request from "supertest"

import { registerQuotaRoutes } from "./routes.js"

const createApp = (getQuotaProviders) => {
  const app = express()
  app.use(express.json())
  registerQuotaRoutes(app, { getQuotaProviders })
  return app
}

describe("quota routes", () => {
  test("answers a failed provider load with a stable message, not the exception text", async () => {
    // The raw message carried absolute paths and module specifiers into the client, which the
    // sibling ax-code routes deliberately avoid ("must not reach the client").
    const error = new Error("Cannot find module '/Users/someone/secret/quota/index.js'")
    const app = createApp(async () => {
      throw error
    })

    const response = await request(app).get("/api/quota/providers").expect(500)

    expect(response.body.error).toBe("Failed to list quota providers")
    expect(JSON.stringify(response.body)).not.toContain("/Users/someone")
  })

  test("answers a failed provider fetch with a stable message", async () => {
    const app = createApp(async () => ({
      listConfiguredQuotaProviders: () => [],
      fetchQuotaForProvider: async () => {
        throw new Error("ENOENT: no such file or directory, open '/Users/someone/.config/token'")
      },
    }))

    const response = await request(app).get("/api/quota/anthropic").expect(500)

    expect(response.body.error).toBe("Failed to fetch quota")
    expect(JSON.stringify(response.body)).not.toContain("/Users/someone")
  })

  test("returns the providers the quota module lists", async () => {
    const provider = { id: "anthropic", label: "Anthropic" }
    const app = createApp(async () => ({
      listConfiguredQuotaProviders: () => [provider],
      fetchQuotaForProvider: vi.fn(),
    }))

    const response = await request(app).get("/api/quota/providers").expect(200)

    expect(response.body).toEqual({ providers: [provider] })
  })
})
