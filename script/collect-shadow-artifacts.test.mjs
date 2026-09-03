import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { collectShadowArtifacts } from "./collect-shadow-artifacts.mjs"

const temporaryDirectories = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true })
})

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ax-coder-shadow-artifacts-"))
  temporaryDirectories.push(root)
  const sourceDirectory = path.join(root, "source")
  const outputDirectory = path.join(root, "output")
  fs.mkdirSync(sourceDirectory)
  return { sourceDirectory, outputDirectory }
}

function writeFiles(directory, names) {
  for (const name of names) fs.writeFileSync(path.join(directory, name), name)
}

describe("shadow artifact collection", () => {
  it("collects only target-specific macOS release assets", () => {
    const { sourceDirectory, outputDirectory } = fixture()
    writeFiles(sourceDirectory, [
      "AX-Code-7.10.2-mac-arm64.dmg",
      "AX-Code-7.10.2-mac-arm64.dmg.blockmap",
      "AX-Code-7.10.2-mac-arm64.zip",
      "AX-Code-7.10.2-win-x64.zip",
      "latest-mac.yml",
      "builder-debug.yml",
    ])
    expect(
      collectShadowArtifacts({ target: "darwin-arm64", sourceDirectory, outputDirectory, version: "7.10.2" }),
    ).toEqual([
      "AX-Code-7.10.2-mac-arm64.dmg",
      "AX-Code-7.10.2-mac-arm64.dmg.blockmap",
      "AX-Code-7.10.2-mac-arm64.zip",
      "latest-mac.yml",
    ])
  })

  it("renames per-architecture Windows update metadata", () => {
    const { sourceDirectory, outputDirectory } = fixture()
    writeFiles(sourceDirectory, [
      "AX-Code-7.10.2-win-arm64.exe",
      "AX-Code-7.10.2-win-arm64.exe.blockmap",
      "AX-Code-7.10.2-win-arm64.zip",
      "latest.yml",
    ])
    expect(
      collectShadowArtifacts({ target: "win32-arm64", sourceDirectory, outputDirectory, version: "7.10.2" }),
    ).toContain("latest-win-arm64.yml")
  })

  it("normalizes the web tarball name without npm publication", () => {
    const { sourceDirectory, outputDirectory } = fixture()
    writeFiles(sourceDirectory, ["ax-code-desktop-7.10.2.tgz"])
    expect(collectShadowArtifacts({ target: "web", sourceDirectory, outputDirectory, version: "7.10.2" })).toEqual([
      "ax-code-web-7.10.2.tgz",
    ])
  })

  it("fails closed when a primary package or update manifest is absent", () => {
    const { sourceDirectory, outputDirectory } = fixture()
    writeFiles(sourceDirectory, ["AX-Code-7.10.2-linux-x64.AppImage", "latest-linux.yml"])
    expect(() =>
      collectShadowArtifacts({ target: "linux-x64", sourceDirectory, outputDirectory, version: "7.10.2" }),
    ).toThrow("missing linux-x64 .deb artifact")
  })
})
