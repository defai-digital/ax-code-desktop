import { afterEach, describe, expect, it } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { resolveDevAxCodeBinary, searchPathFor } from "./resolve-dev-ax-code-binary.mjs"

const tempDirs = []
afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

function makeTempDir(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}

function makeExecutable(directory, name = "ax-code") {
  const file = path.join(directory, name)
  fs.writeFileSync(file, "#!/bin/sh\necho test\n", { mode: 0o755 })
  fs.chmodSync(file, 0o755)
  return file
}

describe("resolveDevAxCodeBinary", () => {
  it("prefers an executable AX_CODE_BINARY over PATH", () => {
    const dir = makeTempDir("ax-dev-cli-explicit-")
    const explicit = makeExecutable(dir, "custom-ax-code")
    const pathDir = makeTempDir("ax-dev-cli-path-")
    makeExecutable(pathDir)

    expect(
      resolveDevAxCodeBinary({
        env: { AX_CODE_BINARY: explicit, PATH: pathDir },
        platform: "linux",
        warn: () => {},
      }),
    ).toBe(explicit)
  })

  it("uses PATH when AX_CODE_BINARY is absent", () => {
    const pathDir = makeTempDir("ax-dev-cli-path-")
    const binary = makeExecutable(pathDir)

    expect(resolveDevAxCodeBinary({ env: { PATH: pathDir }, platform: "linux", warn: () => {} })).toBe(binary)
  })

  it("ignores a non-executable AX_CODE_BINARY and continues to PATH", () => {
    const dir = makeTempDir("ax-dev-cli-bad-explicit-")
    const invalid = path.join(dir, "not-executable")
    fs.writeFileSync(invalid, "not a binary\n", { mode: 0o644 })
    const pathDir = makeTempDir("ax-dev-cli-path-")
    const binary = makeExecutable(pathDir)
    const warnings = []

    expect(
      resolveDevAxCodeBinary({
        env: { AX_CODE_BINARY: invalid, PATH: pathDir },
        platform: "linux",
        warn: (message) => warnings.push(message),
      }),
    ).toBe(binary)
    expect(warnings.some((warning) => warning.includes("not executable"))).toBe(true)
  })

  it("returns null with a useful warning when no runtime is available", () => {
    const warnings = []
    expect(
      resolveDevAxCodeBinary({
        env: { PATH: "" },
        platform: "linux",
        warn: (message) => warnings.push(message),
      }),
    ).toBeNull()
    expect(warnings).toEqual([
      "[electron-dev] ax-code was not found; set AX_CODE_BINARY or install a compatible AX Code runtime",
    ])
  })
})

describe("searchPathFor", () => {
  it("finds an executable on PATH", () => {
    const dir = makeTempDir("ax-dev-cli-search-")
    const binary = makeExecutable(dir, "tool")
    expect(searchPathFor("tool", { PATH: dir }, "linux")).toBe(binary)
  })
})
