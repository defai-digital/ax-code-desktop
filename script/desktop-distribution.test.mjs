import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, it, expect } from "vitest"
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

const temporary = []
afterEach(() => {
  for (const directory of temporary.splice(0)) fs.rmSync(directory, { recursive: true, force: true })
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
    await expect(upload("/missing", "/missing")).rejects.toThrow("public Desktop release is disabled")
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
      putVerified("releases/download/v7.24.5/test.zip", Buffer.from("changed"), { fetcher }),
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
    await expect(putVerified("test.zip", Buffer.from("content"), { fetcher })).rejects.toThrow("Public bytes differ")
  })
})
