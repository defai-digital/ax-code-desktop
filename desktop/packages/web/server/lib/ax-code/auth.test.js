import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

// The module resolves its data directory when it is first imported, so the environment is set
// before the import.
let dataHome
let auth

beforeAll(async () => {
  dataHome = fs.mkdtempSync(path.join(os.tmpdir(), "ax-code-auth-"))
  process.env.XDG_DATA_HOME = dataHome
  auth = await import("./auth.js")
})

afterAll(() => {
  delete process.env.XDG_DATA_HOME
  fs.rmSync(dataHome, { recursive: true, force: true })
})

describe("writeAuthFile permissions", () => {
  it("tightens an existing auth file that was readable by everyone", () => {
    // `writeFileSync`'s mode only applies when the file is created, so a backup restored with
    // 0644 kept its permissions while the log line reported success.
    fs.mkdirSync(auth.AX_CODE_DATA_DIR, { recursive: true })
    fs.writeFileSync(auth.AUTH_FILE, "{}", { encoding: "utf8", mode: 0o644 })
    fs.chmodSync(auth.AUTH_FILE, 0o644)

    auth.writeAuthFile({ openai: { key: "sk-test" } })

    expect(fs.statSync(auth.AUTH_FILE).mode & 0o777).toBe(0o600)
    expect(JSON.parse(fs.readFileSync(auth.AUTH_FILE, "utf8"))).toEqual({ openai: { key: "sk-test" } })
  })

  it("creates the file with the same permissions when it does not exist", () => {
    fs.rmSync(auth.AUTH_FILE, { force: true })

    auth.writeAuthFile({ openai: { key: "sk-test" } })

    expect(fs.statSync(auth.AUTH_FILE).mode & 0o777).toBe(0o600)
  })
})
