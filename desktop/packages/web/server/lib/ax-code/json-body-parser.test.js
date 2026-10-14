import express from "express"
import { describe, expect, it } from "vitest"
import request from "supertest"

import { registerCommonRequestMiddleware } from "./core-routes.js"

const createApp = () => {
  const app = express()
  registerCommonRequestMiddleware(app, { express })
  app.post("/api/config/themes", (req, res) => res.json({ received: req.body }))
  return app
}

describe("json body parsing failures", () => {
  it("answers 400 for malformed JSON instead of handing the handler an empty body", async () => {
    const response = await request(createApp())
      .post("/api/config/themes")
      .set("content-type", "application/json")
      .send("{ not json")
      .agent(false)

    expect(response.status).toBe(400)
    expect(response.body).toEqual({ error: "Invalid JSON body" })
  })

  it("answers 413 for a body over the limit", async () => {
    const response = await request(createApp())
      .post("/api/config/themes")
      .set("content-type", "application/json")
      .send(JSON.stringify({ padding: "a".repeat(2 * 1024 * 1024) }))
      .agent(false)

    expect(response.status).toBe(413)
    expect(response.body).toEqual({ error: "Request body too large" })
  })

  it("still hands a valid body to the handler", async () => {
    const response = await request(createApp())
      .post("/api/config/themes")
      .set("content-type", "application/json")
      .send({ name: "midnight" })
      .agent(false)

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ received: { name: "midnight" } })
  })

  it("keeps defaulting a missing body to an empty object", async () => {
    const response = await request(createApp()).post("/api/config/themes").agent(false)

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ received: {} })
  })
})
