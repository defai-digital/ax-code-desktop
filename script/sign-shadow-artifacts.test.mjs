import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { afterEach, describe, expect, it } from "vitest"

const repositoryRoot = path.resolve(import.meta.dirname, "..")
const script = path.join(repositoryRoot, "desktop/scripts/sign-shadow-artifacts.sh")
const temporaryDirectories = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true })
})

function directory() {
  const value = fs.mkdtempSync(path.join(os.tmpdir(), "ax-coder-shadow-sign-test-"))
  temporaryDirectories.push(value)
  return value
}

function run(artifactDirectory, env) {
  return spawnSync("bash", [script, artifactDirectory], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      AX_CODE_DESKTOP_MINISIGN_PASSWORD: "",
      AX_CODE_DESKTOP_MINISIGN_SECRET_KEY_B64: "",
      ...env,
    },
  })
}

describe("shadow artifact signing wrapper", () => {
  it("leaves artifacts untouched in explicit unsigned mode", () => {
    const artifacts = directory()
    fs.writeFileSync(path.join(artifacts, "candidate.zip"), "candidate")
    const result = run(artifacts, { AX_CODER_SHADOW_SIGNING_MODE: "unsigned" })
    expect(result.status).toBe(0)
    expect(result.stdout).toContain("detached signing was not requested")
    expect(fs.existsSync(path.join(artifacts, "candidate.zip.minisig"))).toBe(false)
  })

  it("rejects required mode without a secret key", () => {
    const artifacts = directory()
    fs.writeFileSync(path.join(artifacts, "candidate.zip"), "candidate")
    const result = run(artifacts, { AX_CODER_SHADOW_SIGNING_MODE: "required" })
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain("AX_CODE_DESKTOP_MINISIGN_SECRET_KEY_B64 is required")
  })

  it("rejects signatures in unsigned mode", () => {
    const artifacts = directory()
    fs.writeFileSync(path.join(artifacts, "candidate.zip"), "candidate")
    fs.writeFileSync(path.join(artifacts, "candidate.zip.minisig"), "signature")
    const result = run(artifacts, { AX_CODER_SHADOW_SIGNING_MODE: "unsigned" })
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain("already contains Minisign signatures")
  })
})
