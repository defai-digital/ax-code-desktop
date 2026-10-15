import * as releasePolicy from "./release-policy.mjs"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, it, expect, vi } from "vitest"
import {
  hash,
  installers,
  prepare,
  requiredAssets,
  verifyDirectory,
  putVerified,
  upload,
  validateQualification,
} from "../.internal/deploy/distribution.mjs"

// Unit fixtures use synthetic signatures; native release signatures are checked separately.
vi.mock("node:child_process", () => ({ execFileSync: vi.fn() }))
const storageOptions = { account: "a".repeat(32), token: "test-only" }

const temporary = []
afterEach(() => {
  for (const directory of temporary.splice(0)) fs.rmSync(directory, { recursive: true, force: true })
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})
const version = "7.24.5"
const commit = "a".repeat(40)
const verify = (file) => {
  if (fs.readFileSync(`${file}.minisig`, "utf8") !== "valid") throw new Error("Invalid signature")
}
function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ax-desktop-distribution-test-"))
  temporary.push(directory)
  const source = path.join(directory, "source")
  fs.mkdirSync(source)
  for (const name of requiredAssets(version)) {
    fs.writeFileSync(path.join(source, name), name)
    fs.writeFileSync(path.join(source, `${name}.minisig`), "valid")
  }
  const output = path.join(directory, "output")
  const result = prepare({ source, output, version, commit, verify })
  for (const name of [...result.assets.map((asset) => asset.name), "inventory.json", "release-ready.txt"])
    fs.writeFileSync(path.join(output, `${name}.minisig`), "valid")
  return { source, output, result }
}

describe("Desktop distribution preparation and mirror", () => {
  it("prepares all four supported installers and verifies the exact manifest", () => {
    const { output } = fixture()
    expect(verifyDirectory(output, verify)).toMatchObject({ version, commit })
    expect(Object.keys(installers(version))).not.toContain("win32-arm64")
  })
  it("rejects tampering, malformed signatures and incomplete inventory", () => {
    const { output } = fixture()
    fs.appendFileSync(path.join(output, "install"), "tampered")
    expect(() => verifyDirectory(output, verify)).toThrow("Size mismatch")
    fs.writeFileSync(path.join(output, "inventory.json.minisig"), "invalid")
    expect(() => verifyDirectory(output, verify)).toThrow("Invalid signature")
  })
  it("rejects malicious signed filenames before reading outside the package", () => {
    const { output, result } = fixture()
    result.assets[0].name = "../secret"
    fs.writeFileSync(path.join(output, "inventory.json"), JSON.stringify(result))
    expect(() => verifyDirectory(output, verify)).toThrow("Unsafe or duplicate")
  })
  it("rejects source symlinks and existing output directories", () => {
    const { source, output } = fixture()
    expect(() => prepare({ source, output, version, commit, verify })).toThrow("Output already exists")
    const file = path.join(source, requiredAssets(version)[0])
    fs.unlinkSync(file)
    fs.symlinkSync(path.join(source, requiredAssets(version)[1]), file)
    expect(() => prepare({ source, output: `${output}-new`, version, commit, verify })).toThrow("regular file")
  })
  it("checks the release policy before network or credential use", async () => {
    const original = releasePolicy.assertPublicReleaseAuthorized
    const guard = vi
      .spyOn(releasePolicy, "assertPublicReleaseAuthorized")
      .mockImplementation(() => original({ stage: "shadow-only", publicRelease: { enabled: false } }))
    try {
      await expect(upload("/missing", "/missing")).rejects.toThrow("public release is disabled")
    } finally {
      guard.mockRestore()
    }
  })
  it("requires signed qualification for each gate, platform and inventory", () => {
    const { output, result } = fixture()
    const inventory = { ...result, digest: hash(fs.readFileSync(path.join(output, "inventory.json"))) }
    const record = {
      schema: "ax-code-desktop.download-qualification.v1",
      version,
      commit,
      inventorySha256: inventory.digest,
      gates: {},
      platforms: {},
    }
    expect(() => validateQualification(record, inventory)).toThrow("Missing qualified gate")
    for (const gate of ["signed-shadow", "upgrade", "rollback", "data-and-credential-continuity", "human-approval"])
      record.gates[gate] = { verified: true, evidence: "reviewed-receipt" }
    for (const target of Object.keys(installers(version)))
      record.platforms[target] = { verified: true, evidence: "native-receipt" }
    expect(() => validateQualification(record, inventory)).not.toThrow()
    record.inventorySha256 = "0".repeat(64)
    expect(() => validateQualification(record, inventory)).toThrow("exact signed inventory")
  })
  it("never overwrites immutable public version objects", async () => {
    const calls = []
    const fetcher = async (url, options) => {
      calls.push(options?.method ?? "GET")
      return new Response("existing")
    }
    await expect(
      putVerified("releases/download/v7.24.5/test.zip", Buffer.from("changed"), { ...storageOptions, fetcher }),
    ).rejects.toThrow("immutable")
    expect(calls).toEqual(["GET"])
  })
  it("uploads missing objects and verifies the public bytes", async () => {
    let content
    const fetcher = async (_url, options) => {
      if (options?.method === "PUT") {
        content = options.body
        return new Response("ok")
      }
      return content ? new Response(content) : new Response("missing", { status: 404 })
    }
    await expect(
      putVerified("test.zip", Buffer.from("verified"), { fetcher, account: "a".repeat(32), token: "test-only" }),
    ).resolves.toBeUndefined()
  })
  it("rejects cached errors and incorrect uploaded bytes", async () => {
    await expect(
      putVerified("test.zip", Buffer.from("content"), {
        ...storageOptions,
        fetcher: async () => new Response("blocked", { status: 503 }),
      }),
    ).rejects.toThrow("HTTP 503")
    let uploaded = false
    const fetcher = async (_url, options) => {
      if (options?.method === "PUT") {
        uploaded = true
        return new Response("ok")
      }
      return uploaded ? new Response("wrong") : new Response("missing", { status: 404 })
    }
    await expect(putVerified("test.zip", Buffer.from("content"), { ...storageOptions, fetcher })).rejects.toThrow(
      "Stored R2 bytes differ",
    )
  })

  it("uses authoritative storage to reject an immutable collision despite a stale public 404", async () => {
    const puts = []
    const fetcher = async (url, options) => {
      if (options.method === "PUT") puts.push(url)
      return url.startsWith("https://api.cloudflare.com/")
        ? new Response("existing immutable bytes")
        : new Response("stale", { status: 404 })
    }
    await expect(putVerified("test.zip", Buffer.from("new"), { ...storageOptions, fetcher })).rejects.toThrow(
      "immutable",
    )
    expect(puts).toEqual([])
  })

  it("restores a missing storage object even when the public cache still serves matching bytes", async () => {
    let stored
    let puts = 0
    const content = Buffer.from("qualified")
    const fetcher = async (url, options) => {
      if (!url.startsWith("https://api.cloudflare.com/")) return new Response(content)
      if (options.method === "PUT") {
        stored = options.body
        puts++
        return new Response("ok")
      }
      return stored ? new Response(stored) : new Response("missing", { status: 404 })
    }
    await putVerified("test.zip", content, { ...storageOptions, fetcher })
    expect(puts).toBe(1)
    expect(stored).toEqual(content)
  })

  it("rejects oversized REST objects before any network call", async () => {
    const fetcher = vi.fn()
    await expect(
      putVerified("test.zip", Buffer.alloc(300 * 1024 * 1024 + 1), { ...storageOptions, fetcher }),
    ).rejects.toThrow("300 MiB")
    expect(fetcher).not.toHaveBeenCalled()
  })

  it("publishes only the qualified snapshot when a later source file changes during upload", async () => {
    const { output, result } = fixture()
    const inventoryDigest = hash(fs.readFileSync(path.join(output, "inventory.json")))
    const qualification = path.join(output, "qualification.json")
    const record = {
      schema: "ax-code-desktop.download-qualification.v1",
      version,
      commit,
      inventorySha256: inventoryDigest,
      gates: Object.fromEntries(
        ["signed-shadow", "upgrade", "rollback", "data-and-credential-continuity", "human-approval"].map((key) => [
          key,
          { verified: true, evidence: "unit-fixture" },
        ]),
      ),
      platforms: Object.fromEntries(
        Object.keys(installers(version)).map((key) => [key, { verified: true, evidence: "unit-fixture" }]),
      ),
    }
    fs.writeFileSync(qualification, JSON.stringify(record))
    fs.writeFileSync(qualification + ".minisig", "valid")
    const target = result.assets.at(-1).name
    const original = fs.readFileSync(path.join(output, target))
    const objects = new Map(),
      puts = []
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", storageOptions.account)
    vi.stubEnv("CLOUDFLARE_API_TOKEN", storageOptions.token)
    vi.stubGlobal("fetch", async (url, options) => {
      const key = url.startsWith("https://api.cloudflare.com/")
        ? url.split("/objects/")[1]
        : url.split("/ax-code-desktop/")[1]
      if (options.method === "PUT") {
        if (!puts.length) fs.writeFileSync(path.join(output, target), "tampered after qualification")
        objects.set(key, Buffer.from(options.body))
        puts.push(key)
        return new Response("ok")
      }
      return objects.has(key) ? new Response(objects.get(key)) : new Response("missing", { status: 404 })
    })
    await upload(output, qualification)
    expect(objects.get(`releases/download/v${version}/${target}`)).toEqual(original)
    expect(puts.at(-1)).toBe("latest.txt")
  })
})

describe("First public cutover staging", () => {
  it("checks policy before staging touches files, credentials or network", async () => {
    const { stage } = await import("../.internal/deploy/distribution.mjs")
    const original = releasePolicy.assertPublicReleaseAuthorized
    const guard = vi
      .spyOn(releasePolicy, "assertPublicReleaseAuthorized")
      .mockImplementation(() => original({ stage: "shadow-only", publicRelease: { enabled: false } }))
    try {
      await expect(stage("/missing", "/missing")).rejects.toThrow("public release is disabled")
    } finally {
      guard.mockRestore()
    }
  })
  it("verifies private R2 bytes without depending on a publicly enabled gateway", async () => {
    const { putStaged, verifyReleaseObjects } = await import("../.internal/deploy/distribution.mjs")
    const objects = new Map()
    const calls = []
    const fetcher = async (url, options) => {
      expect(url).toContain("https://api.cloudflare.com/client/v4/")
      expect(options.headers.Authorization).toBe("Bearer test-only")
      calls.push(options.method ?? "GET")
      if (options.method === "PUT") {
        objects.set(url, options.body)
        return new Response("ok")
      }
      return objects.has(url) ? new Response(objects.get(url)) : new Response("missing", { status: 404 })
    }
    const options = { fetcher, account: "a".repeat(32), token: "test-only" }
    const key = "releases/download/v7.24.5/installer.zip"
    const content = Buffer.from("signed bytes")
    await putStaged(key, content, options)
    await verifyReleaseObjects([{ key, content }], options)
    const before = calls.length
    await putStaged(key, content, options)
    expect(calls.slice(before)).toEqual(["GET"])
    await expect(putStaged(key, Buffer.from("changed"), options)).rejects.toThrow("immutable")
  })
  it("rejects failed storage proof and mismatched anonymous bytes", async () => {
    const { putStaged, verifyReleaseObjects } = await import("../.internal/deploy/distribution.mjs")
    let uploaded = false
    const options = {
      account: "a".repeat(32),
      token: "test-only",
      fetcher: async (_url, options) => {
        if (options.method === "PUT") {
          uploaded = true
          return new Response("ok")
        }
        return uploaded ? new Response("wrong") : new Response("missing", { status: 404 })
      },
    }
    await expect(putStaged("test.zip", Buffer.from("signed"), options)).rejects.toThrow("Staged R2 bytes differ")
    await expect(
      verifyReleaseObjects(
        [{ key: "test.zip", content: Buffer.from("signed") }],
        { fetcher: async () => new Response("wrong") },
        true,
      ),
    ).rejects.toThrow("Release bytes differ")
  })
  it("keeps readiness last in a version and the latest pointer last globally", async () => {
    const { releaseObjects } = await import("../.internal/deploy/distribution.mjs")
    const { output, result } = fixture()
    const objects = releaseObjects(output, result)
    const immutable = objects.filter((object) => !object.mutable)
    expect(immutable.at(-2).key).toMatch(/release-ready\.txt\.minisig$/)
    expect(immutable.at(-1).key).toMatch(/release-ready\.txt$/)
    expect(objects.at(-2).key).toBe("latest.txt.minisig")
    expect(objects.at(-1).key).toBe("latest.txt")
  })
})

it("refuses source bytes changed between qualification and staging snapshot", async () => {
  const { releaseObjects } = await import("../.internal/deploy/distribution.mjs")
  const { output, result } = fixture()
  fs.appendFileSync(path.join(output, "install"), "changed after verification")
  expect(() => releaseObjects(output, result)).toThrow("Source changed after verification")
})
