import fs from "node:fs"
import { execFileSync } from "node:child_process"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  readRuntimePin,
  releaseAssetUrls,
  repositoryRoot,
  runtimeArtifactForTarget,
  runtimeTargetKey,
  verifyPinnedFile,
  verifyRuntimePin,
} from "./runtime-pin.mjs"

const tempDirectories = []

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true })
})

describe("runtime pin", () => {
  it("preserves pinned public-key bytes with Windows automatic line endings", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ax-coder-key-checkout-"))
    tempDirectories.push(directory)
    const pin = readRuntimePin(repositoryRoot)
    const key = path.join(directory, pin.minisign.publicKey)
    fs.mkdirSync(path.dirname(key), { recursive: true })
    fs.copyFileSync(path.join(repositoryRoot, pin.minisign.publicKey), key)
    fs.copyFileSync(path.join(repositoryRoot, ".gitattributes"), path.join(directory, ".gitattributes"))
    const git = (...args) =>
      execFileSync("git", ["-c", "core.autocrlf=true", ...args], { cwd: directory, stdio: "pipe" })
    git("init", "--quiet")
    git("add", ".gitattributes", pin.minisign.publicKey)
    fs.unlinkSync(key)
    git("checkout", "--", pin.minisign.publicKey)
    expect(() => verifyPinnedFile(key, pin.minisign, "checked-out public key")).not.toThrow()
  })
  it("validates the committed runtime pin and public key independently of Desktop versions", () => {
    const pin = verifyRuntimePin(repositoryRoot)
    expect(pin.version).toBe("7.27.0")
    expect(Object.keys(pin.artifacts)).toHaveLength(4)
  })

  it("resolves only supported platform targets", () => {
    const pin = readRuntimePin(repositoryRoot)
    expect(runtimeTargetKey("darwin", "arm64")).toBe("darwin-arm64")
    expect(runtimeTargetKey("darwin", "x64")).toBeNull()
    expect(runtimeTargetKey("win32", "arm64")).toBeNull()
    expect(runtimeArtifactForTarget(pin, { platform: "win32", arch: "x64" })?.filename).toBe("ax-code-windows-x64.zip")
  })

  it("constructs URLs from the pinned repository and release tag", () => {
    const pin = readRuntimePin(repositoryRoot)
    const artifact = runtimeArtifactForTarget(pin, { platform: "linux", arch: "x64" })
    expect(releaseAssetUrls(pin, artifact)).toEqual({
      archiveUrl: "https://github.com/defai-digital/ax-code/releases/download/v7.27.0/ax-code-linux-x64.tar.gz",
      signatureUrl:
        "https://github.com/defai-digital/ax-code/releases/download/v7.27.0/ax-code-linux-x64.tar.gz.minisig",
    })
  })

  it("rejects downloaded content that differs from the pin", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ax-coder-runtime-pin-"))
    tempDirectories.push(directory)
    const file = path.join(directory, "asset")
    fs.writeFileSync(file, "verified content")

    expect(() => verifyPinnedFile(file, { size: 16, sha256: "0".repeat(64) }, "fixture")).toThrow("SHA-256 mismatch")
    expect(() => verifyPinnedFile(file, { size: 99, sha256: "0".repeat(64) }, "fixture")).toThrow("size mismatch")
  })
})
