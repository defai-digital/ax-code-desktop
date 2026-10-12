import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { afterEach, describe, it, expect } from "vitest"
import { hash, installers } from "../.internal/deploy/distribution.mjs"

const temporary = []
afterEach(() => {
  for (const directory of temporary.splice(0)) fs.rmSync(directory, { recursive: true, force: true })
})
const original = fs.readFileSync(new URL("../.internal/deploy/install", import.meta.url), "utf8")
function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ax-desktop-bootstrap-test-"))
  temporary.push(directory)
  const bin = path.join(directory, "bin")
  const files = path.join(directory, "files")
  fs.mkdirSync(bin)
  fs.mkdirSync(files)
  const executable = (name, source) =>
    fs.writeFileSync(path.join(bin, name), `#!/bin/bash\n${source}\n`, { mode: 0o755 })
  executable("uname", 'if [[ "$1" == -s ]]; then echo Linux; else echo x86_64; fi')
  executable(
    "curl",
    'url=""; output=""; while [[ $# -gt 0 ]]; do if [[ "$1" == -o ]]; then output="$2"; shift 2; elif [[ "$1" == https:* ]]; then url="$1"; shift; else shift; fi; done; cp "$AX_FIXTURE_FILES/${url##*/}" "$output"',
  )
  executable("sudo", 'echo "$*" > "$AX_FIXTURE_INSTALL"')
  executable("apt", "exit 0")
  executable(
    "dpkg-deb",
    'case "$3" in Package) echo ax-code-desktop;; Version) echo 7.24.5;; Architecture) echo amd64;; esac',
  )
  const releaseFiles = (name, content) => {
    fs.writeFileSync(path.join(files, name), content)
    fs.writeFileSync(path.join(files, `${name}.minisig`), "valid")
  }
  const verifierDir = path.join(directory, "verifier/minisign-linux/x86_64")
  fs.mkdirSync(verifierDir, { recursive: true })
  fs.writeFileSync(
    path.join(verifierDir, "minisign"),
    '#!/bin/bash\nwhile [[ $# -gt 0 ]]; do if [[ "$1" == -x ]]; then signature="$2"; break; fi; shift; done\n[[ "$(cat "$signature")" == valid ]]\n',
    { mode: 0o755 },
  )
  const archive = path.join(files, "minisign-0.12-linux.tar.gz")
  const packed = spawnSync("tar", ["-czf", archive, "-C", path.join(directory, "verifier"), "minisign-linux"])
  expect(packed.status).toBe(0)
  fs.writeFileSync(path.join(directory, "os-release"), 'ID=ubuntu\nVERSION_ID="24.04"\n')
  const version = "7.24.5"
  const commit = "a".repeat(40)
  const rows = Object.entries(installers(version)).map(([target, name]) => {
    const content = Buffer.from(name)
    releaseFiles(name, content)
    return `${target}\t${name}\t${content.length}\t${hash(content)}`
  })
  releaseFiles("latest.txt", "v7.24.5\n")
  const manifest = `release\tv7.24.5\t${commit}\n${rows.join("\n")}\n`
  releaseFiles("release.tsv", manifest)
  releaseFiles("release-ready.txt", `v7.24.5\n${commit}\n${hash(manifest)}\n`)
  const script = path.join(directory, "install")
  // Replace only OS fixture/verifier archive pins and final TTY redirection for this harness.
  fs.writeFileSync(
    script,
    original
      .replaceAll("/etc/os-release", path.join(directory, "os-release"))
      .replace("9a599b48ba6eb7b1e80f12f36b94ceca7c00b7a5173c95c3efc88d9822957e73", hash(fs.readFileSync(archive)))
      .replaceAll("< /dev/tty", "< /dev/null"),
  )
  const installed = path.join(directory, "installed")
  const run = () =>
    spawnSync("bash", [script], {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        AX_FIXTURE_FILES: files,
        AX_FIXTURE_INSTALL: installed,
      },
    })
  return { files, installed, run }
}

describe("Unix Desktop bootstrap control flow (mocked OS and signatures)", () => {
  it("reaches apt only after consistent signed metadata and verified artifact bytes", () => {
    const { installed, run } = fixture()
    const result = run()
    expect(result.status, result.stderr).toBe(0)
    expect(fs.readFileSync(installed, "utf8")).toContain("apt install")
  })
  it("never installs an artifact with a hash mismatch", () => {
    const { files, installed, run } = fixture()
    const file = path.join(files, installers("7.24.5")["linux-x64"])
    const content = fs.readFileSync(file)
    content[0] = 0
    fs.writeFileSync(file, content)
    const result = run()
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain("SHA-256 mismatch")
    expect(fs.existsSync(installed)).toBe(false)
  })
  it("rejects an invalid release signature before installing", () => {
    const { files, installed, run } = fixture()
    fs.writeFileSync(path.join(files, "release.tsv.minisig"), "invalid")
    expect(run().stderr).toContain("Invalid release signature")
    expect(fs.existsSync(installed)).toBe(false)
  })
  it("refuses incomplete readiness and duplicate target rows", () => {
    const { files, installed, run } = fixture()
    fs.writeFileSync(path.join(files, "release-ready.txt"), "old-marker")
    expect(run().stderr).toContain("not ready")
    const manifest = fs.readFileSync(path.join(files, "release.tsv"), "utf8").split("\n")
    manifest[4] = manifest[3]
    fs.writeFileSync(path.join(files, "release.tsv"), manifest.join("\n"))
    expect(run().stderr).toContain("Invalid installer inventory")
    expect(fs.existsSync(installed)).toBe(false)
  })
})
