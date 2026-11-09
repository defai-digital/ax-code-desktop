import fs from "fs"
import os from "os"
import path from "path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

describe("git identity storage", () => {
  let tempHome

  beforeEach(() => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "ax-code-git-identity-"))
  })

  afterEach(() => {
    vi.doUnmock("os")
    vi.resetModules()
    fs.rmSync(tempHome, { recursive: true, force: true })
  })

  const importStorage = async () => {
    vi.resetModules()
    vi.doMock("os", () => ({
      default: { homedir: () => tempHome },
      homedir: () => tempHome,
    }))
    return import("./identity-storage.js")
  }

  const storageDir = () => path.join(tempHome, ".config", "openchamber")
  const storageFile = () => path.join(storageDir(), "git-identities.json")

  it("stores profiles in a private directory and file", async () => {
    if (process.platform === "win32") {
      return
    }

    const { createProfile } = await importStorage()

    createProfile({
      id: "work",
      userName: "Test User",
      userEmail: "test@example.com",
      sshKey: "~/.ssh/id_ed25519",
    })

    expect(fs.statSync(storageDir()).mode & 0o777).toBe(0o700)
    expect(fs.statSync(storageFile()).mode & 0o777).toBe(0o600)
  })

  it("cleans up temporary files when saving profiles fails", async () => {
    fs.mkdirSync(storageFile(), { recursive: true })
    const { saveProfiles } = await importStorage()

    expect(() => saveProfiles({ profiles: [] })).toThrow()
    expect(fs.readdirSync(storageDir()).filter((name) => name.startsWith(".git-identities."))).toEqual([])
  })

  it("loads profiles without a preflight existence check", async () => {
    fs.mkdirSync(storageDir(), { recursive: true })
    fs.writeFileSync(storageFile(), JSON.stringify({ profiles: [{ id: "work" }] }), "utf8")
    const { loadProfiles } = await importStorage()
    const existsSync = vi.spyOn(fs, "existsSync").mockImplementation((candidate) => {
      if (candidate === storageFile()) {
        throw new Error("loadProfiles should not call existsSync before reading")
      }
      return false
    })

    try {
      expect(loadProfiles()).toEqual({ profiles: [{ id: "work" }] })
    } finally {
      existsSync.mockRestore()
    }
  })

  it("treats a missing profiles file as empty storage", async () => {
    const { loadProfiles } = await importStorage()

    expect(loadProfiles()).toEqual({ profiles: [] })
  })

  it("refuses profiles that git could not use or the routes could never address", async () => {
    // A numeric id was saved and then matched no update or delete (route ids are strings); an update could
    // store the empty email that create refuses, which then reached `git config user.email`.
    const { createProfile, updateProfile, getProfiles } = await importStorage()

    expect(() => createProfile({ id: 1, userName: "a", userEmail: "b@example.com" })).toThrow(
      expect.objectContaining({ statusCode: 400 }),
    )
    createProfile({ id: "work", userName: "Test User", userEmail: "test@example.com" })
    expect(() => createProfile({ id: "work", userName: "x", userEmail: "y" })).toThrow(
      expect.objectContaining({ statusCode: 409 }),
    )
    expect(() => updateProfile("work", { userEmail: "" })).toThrow(expect.objectContaining({ statusCode: 400 }))
    expect(() => updateProfile("missing", { userName: "x" })).toThrow(expect.objectContaining({ statusCode: 404 }))
    expect(getProfiles()).toEqual([expect.objectContaining({ id: "work", userEmail: "test@example.com" })])
  })
})
