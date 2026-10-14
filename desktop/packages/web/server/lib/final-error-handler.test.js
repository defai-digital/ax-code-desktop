import express from "express"
import { describe, expect, it, vi } from "vitest"
import request from "supertest"

import { createFinalErrorHandler } from "./final-error-handler.js"

const createApp = (handler) => {
  const app = express()
  app.get("/boom", () => {
    throw new Error("EACCES: permission denied, open '/Users/secret/settings.json'")
  })
  app.get("/too-large", () => {
    const error = new Error("request entity too large")
    error.statusCode = 413
    throw error
  })
  app.get("/not-found-status", () => {
    const error = new Error("missing /Users/secret/file")
    error.status = 404
    throw error
  })
  app.use(handler)
  return app
}

describe("final error handler", () => {
  it("answers with a stable message instead of the stack trace", async () => {
    const logger = { error: vi.fn() }
    const app = createApp(createFinalErrorHandler({ logger }))

    const response = await request(app).get("/boom").agent(false)

    expect(response.status).toBe(500)
    expect(response.body).toEqual({ error: "Internal server error" })
    expect(JSON.stringify(response.body)).not.toContain("/Users/secret")
    expect(logger.error).toHaveBeenCalled()
  })

  it("keeps the status a handler attached", async () => {
    const logger = { error: vi.fn() }
    const app = createApp(createFinalErrorHandler({ logger }))

    const tooLarge = await request(app).get("/too-large").agent(false)
    expect(tooLarge.status).toBe(413)
    expect(tooLarge.body).toEqual({ error: "Request body too large" })

    const notFound = await request(app).get("/not-found-status").agent(false)
    expect(notFound.status).toBe(404)
    expect(notFound.body).toEqual({ error: "Not found" })
  })
})
