import { describe, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

const repoRoot = path.resolve(import.meta.dir, "..")
const script = path.join(repoRoot, "scripts/minisign-artifacts.sh")
const pinnedPublicKey = "RWS6la0s0/o4gdFUZ0Bk/BkrnN8qC2CFOfLXVP5OtQTrvm1BQeOvXgao"

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ax-code-desktop-minisign-test-"))
}

function writeExecutable(file, body) {
  fs.writeFileSync(file, body)
  fs.chmodSync(file, 0o755)
}

function createFixture() {
  const dir = makeTempDir()
  const bin = path.join(dir, "bin")
  fs.mkdirSync(bin)

  const secretKey = path.join(dir, "ax-code-desktop.minisign.key")
  const publicKey = path.join(dir, "ax-code-desktop.minisign.pub")
  const asset = path.join(dir, "asset.zip")
  const stdinLog = path.join(dir, "minisign-stdin.log")

  fs.writeFileSync(secretKey, "secret")
  fs.chmodSync(secretKey, 0o600)
  fs.writeFileSync(
    publicKey,
    ["untrusted comment: minisign public key 8138FAD32CAD95BA", pinnedPublicKey, ""].join("\n"),
  )
  fs.writeFileSync(asset, "asset")

  writeExecutable(
    path.join(bin, "minisign"),
    `#!/usr/bin/env bash
set -euo pipefail
stdin="$(cat || true)"
if [ -n "$stdin" ]; then
  printf '%s' "$stdin" >> "${stdinLog}"
fi
sig=""
mode="sign"
while [ "$#" -gt 0 ]; do
  case "$1" in
    -V) mode="verify"; shift ;;
    -x) sig="$2"; shift 2 ;;
    *) shift ;;
  esac
done
if [ "$mode" = "sign" ] && [ -n "$sig" ]; then
  printf 'fake signature\\n' > "$sig"
fi
`,
  )

  return { dir, bin, secretKey, publicKey, asset, stdinLog }
}

function runScript(args, fixture, env = {}) {
  return spawnSync("bash", [script, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${fixture.bin}${path.delimiter}${process.env.PATH ?? ""}`,
      ...env,
    },
  })
}

describe("minisign-artifacts.sh", () => {
  test("rejects a public key that does not match the pinned release key", () => {
    const fixture = createFixture()
    try {
      fs.writeFileSync(
        fixture.publicKey,
        ["untrusted comment: minisign public key 0000000000000000", "RW00000000000000000000000000000000000000000000000000000000000", ""].join("\n"),
      )

      const result = runScript(
        ["--secret-key", fixture.secretKey, "--public-key", fixture.publicKey, fixture.asset],
        fixture,
      )

      expect(result.status).not.toBe(0)
      expect(result.stderr).toContain("does not match the pinned AX Code Desktop release key")
      expect(fs.existsSync(`${fixture.asset}.minisig`)).toBe(false)
    } finally {
      fs.rmSync(fixture.dir, { recursive: true, force: true })
    }
  })

  test("passes explicit minisign password to the signing command", () => {
    const fixture = createFixture()
    try {
      const result = runScript(
        ["--secret-key", fixture.secretKey, "--public-key", fixture.publicKey, fixture.asset],
        fixture,
        { AX_CODE_DESKTOP_MINISIGN_PASSWORD: "from-env" },
      )

      expect(result.status).toBe(0)
      expect(fs.existsSync(`${fixture.asset}.minisig`)).toBe(true)
      expect(fs.readFileSync(fixture.stdinLog, "utf8")).toBe("from-env")
    } finally {
      fs.rmSync(fixture.dir, { recursive: true, force: true })
    }
  })

  test("uses macOS Keychain passphrase when no password env is set", () => {
    const fixture = createFixture()
    try {
      writeExecutable(
        path.join(fixture.bin, "uname"),
        `#!/usr/bin/env bash
printf 'Darwin\\n'
`,
      )
      writeExecutable(
        path.join(fixture.bin, "security"),
        `#!/usr/bin/env bash
if [ "$1" = "find-generic-password" ]; then
  printf 'from-keychain\\n'
  exit 0
fi
exit 1
`,
      )

      const result = runScript(
        ["--secret-key", fixture.secretKey, "--public-key", fixture.publicKey, fixture.asset],
        fixture,
      )

      expect(result.status).toBe(0)
      expect(fs.existsSync(`${fixture.asset}.minisig`)).toBe(true)
      expect(fs.readFileSync(fixture.stdinLog, "utf8")).toBe("from-keychain")
    } finally {
      fs.rmSync(fixture.dir, { recursive: true, force: true })
    }
  })
})
