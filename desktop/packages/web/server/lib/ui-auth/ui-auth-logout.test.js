import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const createResponse = () => {
  const headers = new Map()
  return {
    statusCode: 200,
    body: undefined,
    setHeader(name, value) {
      headers.set(name.toLowerCase(), value)
    },
    getHeader(name) {
      return headers.get(name.toLowerCase())
    },
    status(code) {
      this.statusCode = code
      return this
    },
    json(payload) {
      this.body = payload
      return this
    },
    setCookieHeader() {
      return headers.get("set-cookie") ?? ""
    },
  }
}

const sessionTokenFrom = (res) => {
  const header = res.setCookieHeader()
  const match = /oc_ui_session=([^;]+)/.exec(header)
  return match ? decodeURIComponent(match[1]) : ""
}

describe("ui auth sign-out", () => {
  let tempRoot
  const originalDataDir = process.env.AX_CODE_DESKTOP_DATA_DIR

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ax-code-ui-auth-logout-"))
    process.env.AX_CODE_DESKTOP_DATA_DIR = tempRoot
    vi.resetModules()
  })

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true })
    if (originalDataDir === undefined) delete process.env.AX_CODE_DESKTOP_DATA_DIR
    else process.env.AX_CODE_DESKTOP_DATA_DIR = originalDataDir
    vi.resetModules()
  })

  it("revokes the presented session so the cookie cannot be replayed", async () => {
    const { createUiAuth } = await import("./ui-auth.js")
    const auth = createUiAuth({ password: "correct horse battery staple" })

    const loginRes = createResponse()
    await auth.handleSessionCreate(
      { body: { password: "correct horse battery staple" }, headers: { host: "127.0.0.1:4096" } },
      loginRes,
    )
    const token = sessionTokenFrom(loginRes)
    expect(token).not.toBe("")

    const statusReq = { headers: { host: "127.0.0.1:4096", cookie: `oc_ui_session=${encodeURIComponent(token)}` } }
    const beforeRes = createResponse()
    await auth.handleSessionStatus(statusReq, beforeRes)
    expect(beforeRes.body).toEqual({ authenticated: true })

    const logoutReq = { headers: { host: "127.0.0.1:4096", cookie: `oc_ui_session=${encodeURIComponent(token)}` } }
    const logoutRes = createResponse()
    await auth.handleSessionLogout(logoutReq, logoutRes)

    expect(logoutRes.body).toEqual({ authenticated: false })
    expect(logoutRes.setCookieHeader()).toContain("Max-Age=0")

    const afterRes = createResponse()
    await auth.handleSessionStatus(statusReq, afterRes)
    expect(afterRes.body).toMatchObject({ authenticated: false, locked: true })

    auth.dispose()
  })

  it("still clears the cookie for a caller with no usable session", async () => {
    const { createUiAuth } = await import("./ui-auth.js")
    const auth = createUiAuth({ password: "correct horse battery staple" })

    const res = createResponse()
    await auth.handleSessionLogout({ headers: { host: "127.0.0.1:4096", cookie: "oc_ui_session=not-a-jwt" } }, res)

    expect(res.body).toEqual({ authenticated: false })
    expect(res.setCookieHeader()).toContain("Max-Age=0")

    auth.dispose()
  })
})
