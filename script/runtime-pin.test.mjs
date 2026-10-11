import fs from "node:fs"
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
  it("validates the committed pin, public key, and Desktop versions", () => {
    const pin = verifyRuntimePin(repositoryRoot)
    expect(pin.version).toBe("7.24.4")
    expect(Object.keys(pin.artifacts)).toHaveLength(5)
  })

  it("resolves only supported platform targets", () => {
    const pin = readRuntimePin(repositoryRoot)
    expect(runtimeTargetKey("darwin", "arm64")).toBe("darwin-arm64")
    expect(runtimeTargetKey("darwin", "x64")).toBeNull()
    expect(runtimeArtifactForTarget(pin, { platform: "win32", arch: "x64" })?.filename).toBe("ax-code-windows-x64.zip")
  })

  it("constructs URLs from the pinned repository and release tag", () => {
    const pin = readRuntimePin(repositoryRoot)
    const artifact = runtimeArtifactForTarget(pin, { platform: "linux", arch: "x64" })
    expect(releaseAssetUrls(pin, artifact)).toEqual({
      archiveUrl: "https://github.com/defai-digital/ax-code/releases/download/v7.24.4/ax-code-linux-x64.tar.gz",
      signatureUrl:
        "https://github.com/defai-digital/ax-code/releases/download/v7.24.4/ax-code-linux-x64.tar.gz.minisig",
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
