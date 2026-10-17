import express from "express"
import fs from "fs"
import os from "os"
import path from "path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import request from "supertest"

import { derivePasswordBinding } from "./ui-auth.js"

describe("ui auth", () => {
  let tempRoot
  const originalDataDir = process.env.AX_CODE_DESKTOP_DATA_DIR

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ax-code-ui-auth-"))
  })

  const originalJwtSecret = process.env.AX_CODE_JWT_SECRET

  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
    fs.rmSync(tempRoot, { recursive: true, force: true })
    if (originalDataDir === undefined) {
      delete process.env.AX_CODE_DESKTOP_DATA_DIR
    } else {
      process.env.AX_CODE_DESKTOP_DATA_DIR = originalDataDir
    }
    if (originalJwtSecret === undefined) {
      delete process.env.AX_CODE_JWT_SECRET
    } else {
      process.env.AX_CODE_JWT_SECRET = originalJwtSecret
    }
  })

  it("derives a stable passkey password binding with scrypt", () => {
    const first = derivePasswordBinding("correct horse battery staple", "jwt-secret")
    const second = derivePasswordBinding("correct horse battery staple", "jwt-secret")
    const rotated = derivePasswordBinding("correct horse battery staple", "rotated-secret")

    expect(first).toBe(second)
    expect(first).not.toBe(rotated)
    expect(first).toMatch(/^[a-f0-9]{128}$/)
  })

  it("loads an existing JWT secret without a preflight existence check", async () => {
    process.env.AX_CODE_DESKTOP_DATA_DIR = tempRoot
    const secretFile = path.join(tempRoot, "jwt-secret")
    fs.writeFileSync(secretFile, "persisted-secret-at-least-32-bytes-long", "utf8")
    const existsSync = vi.spyOn(fs, "existsSync").mockImplementation((candidate) => {
      if (candidate === secretFile) {
        return false
      }
      return false
    })
    const log = vi.spyOn(console, "log").mockImplementation(() => {})
    vi.resetModules()

    const { createUiAuth } = await import("./ui-auth.js")
    const auth = createUiAuth({ password: "correct horse battery staple" })

    try {
      expect(fs.readFileSync(secretFile, "utf8")).toBe("persisted-secret-at-least-32-bytes-long")
      expect(log).not.toHaveBeenCalledWith(
        expect.stringContaining("[JWT] Generated and persisted new secret to"),
        secretFile,
      )
    } finally {
      auth.dispose()
      existsSync.mockRestore()
      log.mockRestore()
    }
  })

  it("refuses reset-auth without deleting passkeys when the JWT secret is env-pinned", async () => {
    process.env.AX_CODE_DESKTOP_DATA_DIR = tempRoot
    process.env.AX_CODE_JWT_SECRET = "env-pinned-secret-at-least-32-bytes-long"
    vi.resetModules()

    const { createUiAuth } = await import("./ui-auth.js")
    const auth = createUiAuth({ password: "correct horse battery staple" })

    // Spy only after init so we observe writes made by the reset call itself.
    const writeSpy = vi.spyOn(fs, "writeFileSync")
    const res = {
      statusCode: 200,
      body: undefined,
      status(code) {
        this.statusCode = code
        return this
      },
      json(payload) {
        this.body = payload
        return this
      },
    }

    try {
      auth.handleResetAuth({ headers: {} }, res)

      // The guard must fire before any destructive action.
      expect(res.statusCode).toBe(400)
      // The passkey store must never be rewritten (clearAllPasskeys not reached).
      const touchedPasskeyStore = writeSpy.mock.calls.some(([target]) => String(target).includes("ui-passkeys"))
      expect(touchedPasskeyStore).toBe(false)
    } finally {
      auth.dispose()
      writeSpy.mockRestore()
    }
  })

  const seedPasskeyStore = ({ dataDir, secret, password, count }) => {
    // The store is bound to the current secret: `derivePasswordBinding` is what the module itself uses, and a
    // binding that did not match would be wiped by the first read instead of counting.
    const binding = derivePasswordBinding(password, new TextEncoder().encode(secret))
    const passkeys = Array.from({ length: count }, (unused, index) => ({
      id: `credential-${index}`,
      publicKey: Buffer.from([1, 2, 3]).toString("base64url"),
      counter: 1,
      transports: ["internal"],
      deviceType: "singleDevice",
      backedUp: false,
      createdAt: 1,
      lastUsedAt: null,
      label: `Device ${index}`,
      rpID: "localhost",
    }))
    fs.writeFileSync(
      path.join(dataDir, "ui-passkeys.json"),
      JSON.stringify({ version: 1, userID: Buffer.from("user").toString("base64url"), passwordBinding: binding, passkeys }),
      "utf8",
    )
    return passkeys
  }

  const createResponse = () => ({
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code
      return this
    },
    json(payload) {
      this.body = payload
      return this
    },
    setHeader() {},
    getHeader() {
      return ""
    },
  })

  it("reports the passkeys it cleared even though the rotation has already invalidated them", async () => {
    // The rotation rebuilds the passkey controller around a binding derived from the new secret, so its first read
    // replaces the store with an empty one — and a count taken after that is always zero.
    process.env.AX_CODE_DESKTOP_DATA_DIR = tempRoot
    const secret = "persisted-secret-at-least-32-bytes-long"
    fs.writeFileSync(path.join(tempRoot, "jwt-secret"), secret, "utf8")
    seedPasskeyStore({ dataDir: tempRoot, secret, password: "correct horse battery staple", count: 2 })
    vi.resetModules()

    const { createUiAuth } = await import("./ui-auth.js")
    const auth = createUiAuth({ password: "correct horse battery staple" })
    const res = createResponse()

    try {
      await auth.handleResetAuth({ headers: {} }, res)

      expect(res.statusCode).toBe(200)
      expect(res.body).toMatchObject({ cleared: true, clearedPasskeys: 2, signedOutEverywhere: true })
      const stored = JSON.parse(fs.readFileSync(path.join(tempRoot, "ui-passkeys.json"), "utf8"))
      expect(stored.passkeys).toEqual([])
    } finally {
      auth.dispose()
    }
  })

  it("does not touch the passkeys when the sign-out cannot persist its new secret", async () => {
    // Rotating the secret writes it to disk, and that write can fail (a read-only data directory, no space). The
    // passkeys were cleared first, so the reset answered an error with the store already emptied on disk: the
    // promised global sign-out had not happened and the credential the user still had was gone. This is the same
    // rule the env-pinned guard states — nothing is destroyed unless the reset can complete.
    process.env.AX_CODE_DESKTOP_DATA_DIR = tempRoot
    const secretFile = path.join(tempRoot, "jwt-secret")
    const secret = "persisted-secret-at-least-32-bytes-long"
    fs.writeFileSync(secretFile, secret, "utf8")
    const seeded = seedPasskeyStore({ dataDir: tempRoot, secret, password: "correct horse battery staple", count: 2 })
    vi.resetModules()

    const { createUiAuth } = await import("./ui-auth.js")
    const auth = createUiAuth({ password: "correct horse battery staple" })
    const realWrite = fs.writeFileSync
    const writeSpy = vi.spyOn(fs, "writeFileSync").mockImplementation((target, ...rest) => {
      if (String(target) === secretFile) {
        const error = new Error("EACCES: permission denied")
        error.code = "EACCES"
        throw error
      }
      return realWrite(target, ...rest)
    })

    try {
      const res = createResponse()
      await auth.handleResetAuth({ headers: {} }, res)

      expect(res.statusCode).toBeGreaterThanOrEqual(400)
      // The passkeys are still there: nothing was destroyed by a reset that did not complete.
      const stored = JSON.parse(fs.readFileSync(path.join(tempRoot, "ui-passkeys.json"), "utf8"))
      expect(stored.passkeys).toHaveLength(seeded.length)
    } finally {
      auth.dispose()
      writeSpy.mockRestore()
    }
  })

  it("allows reset-auth when the env secret is too short to be in use", async () => {
    // A short env secret is ignored when signing (resolveEnvJwtSecret returns null), so the file
    // secret is what protects the sessions — but the reset guard only asked whether the variable was
    // set at all and refused a sign-out that could complete, leaving those sessions valid.
    const originalDataDir = process.env.AX_CODE_DESKTOP_DATA_DIR
    const originalSecret = process.env.AX_CODE_JWT_SECRET
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ax-code-jwt-short-reset-"))
    process.env.AX_CODE_DESKTOP_DATA_DIR = dir
    process.env.AX_CODE_JWT_SECRET = "short"
    vi.resetModules()

    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    let auth
    try {
      const { createUiAuth } = await import("./ui-auth.js")
      auth = createUiAuth({ password: "correct horse battery staple" })

      const res = {
        statusCode: 200,
        body: undefined,
        status(code) {
          this.statusCode = code
          return this
        },
        json(payload) {
          this.body = payload
          return this
        },
        setHeader() {},
        getHeader() {
          return ""
        },
      }

      await auth.handleResetAuth({ headers: {} }, res)

      expect(res.statusCode).toBe(200)
      expect(res.body).toMatchObject({ cleared: true, signedOutEverywhere: true })
    } finally {
      auth?.dispose?.()
      log.mockRestore()
      fs.rmSync(dir, { recursive: true, force: true })
      if (originalDataDir === undefined) delete process.env.AX_CODE_DESKTOP_DATA_DIR
      else process.env.AX_CODE_DESKTOP_DATA_DIR = originalDataDir
      if (originalSecret === undefined) delete process.env.AX_CODE_JWT_SECRET
      else process.env.AX_CODE_JWT_SECRET = originalSecret
      vi.resetModules()
    }
  })
})

describe("jwt secret strength", () => {
  it("accepts only secrets of at least 32 bytes", async () => {
    const { isStrongJwtSecret, MIN_JWT_SECRET_BYTES } = await import("./ui-auth.js")

    expect(MIN_JWT_SECRET_BYTES).toBe(32)
    expect(isStrongJwtSecret("a".repeat(31))).toBe(false)
    expect(isStrongJwtSecret("a".repeat(32))).toBe(true)
    expect(isStrongJwtSecret("")).toBe(false)
    expect(isStrongJwtSecret(undefined)).toBe(false)
  })

  it("ignores a too-short env secret and signs sessions with a generated one", async () => {
    const originalDataDir = process.env.AX_CODE_DESKTOP_DATA_DIR
    const originalSecret = process.env.AX_CODE_JWT_SECRET
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ax-code-jwt-"))
    process.env.AX_CODE_DESKTOP_DATA_DIR = dir
    process.env.AX_CODE_JWT_SECRET = "short"
    vi.resetModules()

    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    try {
      const { createUiAuth } = await import("./ui-auth.js")
      const auth = createUiAuth({ password: "correct horse battery staple" })

      // A 5-byte HS256 key is guessable, so it must not be used: a strong local
      // secret is generated and persisted instead.
      expect(fs.readFileSync(path.join(dir, "jwt-secret"), "utf8").length).toBeGreaterThanOrEqual(32)
      expect(log).toHaveBeenCalledWith(expect.stringContaining("[JWT] Ignoring AX_CODE_JWT_SECRET"))
      auth.dispose()
    } finally {
      log.mockRestore()
      fs.rmSync(dir, { recursive: true, force: true })
      if (originalDataDir === undefined) delete process.env.AX_CODE_DESKTOP_DATA_DIR
      else process.env.AX_CODE_DESKTOP_DATA_DIR = originalDataDir
      if (originalSecret === undefined) delete process.env.AX_CODE_JWT_SECRET
      else process.env.AX_CODE_JWT_SECRET = originalSecret
      vi.resetModules()
    }
  })
})

describe("ui auth unauthorized responses", () => {
  let tempRoot
  const originalDataDir = process.env.AX_CODE_DESKTOP_DATA_DIR

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ax-code-ui-auth-mounted-"))
    process.env.AX_CODE_DESKTOP_DATA_DIR = tempRoot
    vi.resetModules()
  })

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true })
    if (originalDataDir === undefined) delete process.env.AX_CODE_DESKTOP_DATA_DIR
    else process.env.AX_CODE_DESKTOP_DATA_DIR = originalDataDir
    vi.resetModules()
  })

  it("answers an unauthenticated request to a mounted /api route with JSON", async () => {
    // `req.path` inside a mounted middleware excludes the mount point, so it is "/sessions", never
    // "/api/sessions": the API branch of `respondUnauthorized` could not run, and a client sending the default
    // `Accept: */*` got text/plain where the contract promises { error, locked }.
    const { createUiAuth } = await import("./ui-auth.js")
    const auth = createUiAuth({ password: "correct horse battery staple" })
    const app = express()
    app.use("/api", auth.requireAuth)
    app.get("/api/sessions", (_req, res) => res.json({ ok: true }))

    const response = await request(app).get("/api/sessions").agent(false).set("Accept", "*/*")

    expect(response.status).toBe(401)
    expect(response.body).toEqual({ error: "UI authentication required", locked: true })
  })
})
