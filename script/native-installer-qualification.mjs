#!/usr/bin/env node
import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import crypto from "node:crypto"
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
import { runWindowsInstalledGuiSmoke } from "./windows-installed-gui-smoke.mjs"
import { runSmoke } from "../desktop/packages/electron/scripts/smoke-packaged-asar-cli.mjs"

const require = createRequire(new URL("../desktop/packages/electron/package.json", import.meta.url))
const asar = require("@electron/asar")
const KEY = "RWSlDu++afxCz01OqhYWhfo8+L8pVbSYXJBEb2zoWBuK0WACIzbGVZRO"
export const BASELINE_VERSION = "7.24.5"
const BASELINE_TAG = `v${BASELINE_VERSION}`
export const BASELINES = {
  "darwin-arm64": ["AX-Code-7.24.5-mac-arm64.dmg", "3df335f0d96d596170201ff332955599a6b9cafcf2c1c88d2feac545da60beb1"],
  "win32-x64": ["AX-Code-7.24.5-win-x64.exe", "48355f228b6d7c585f50271a0b9258c543e0dee824c1b9e5824196581edac78b"],
  "linux-x64": ["AX-Code-7.24.5-linux-amd64.deb", "8188fcd1058e3a21cc70906a566c6a60bb3704467e6d3b567b7eb4eb2671ca46"],
  "linux-arm64": ["AX-Code-7.24.5-linux-arm64.deb", "c4ad98ff629eb7a2ef7be90537b81c9ceb4d3e35b4e0fb4a0fc83db27ee3b1e5"],
}
export const TRANSITIONS = [
  ["fresh-install", "candidate"],
  ["baseline-install", "baseline"],
  ["upgrade", "candidate"],
  ["rollback", "baseline"],
  ["final-install", "candidate"],
]
export const digest = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex")
export function qualificationVersion() {
  return JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8")).version
}
export function capturePreservedFile(file) {
  const stat = fs.lstatSync(file)
  assert.ok(stat.isFile() && !stat.isSymbolicLink(), "Continuity evidence requires a regular file")
  return {
    file,
    sha256: digest(file),
    ...(process.platform === "win32" ? {} : { mode: stat.mode & 0o777, uid: stat.uid, gid: stat.gid }),
  }
}
export function verifyPreserved(records) {
  for (const { file, sha256, mode, uid, gid } of records) {
    const stat = fs.lstatSync(file)
    assert.ok(stat.isFile() && !stat.isSymbolicLink(), `Installer replaced a continuity file: ${file}`)
    assert.equal(digest(file), sha256, `Installer changed profile/config bytes: ${file}`)
    if (mode !== undefined) assert.equal(stat.mode & 0o777, mode, `Installer changed credential/profile mode: ${file}`)
    if (uid !== undefined) assert.equal(stat.uid, uid, `Installer changed credential/profile owner: ${file}`)
    if (gid !== undefined) assert.equal(stat.gid, gid, `Installer changed credential/profile group: ${file}`)
  }
}
export function assertHostedRunner(env, target) {
  assert.equal(env.GITHUB_ACTIONS, "true", "Native installation is restricted to disposable hosted runners")
  assert.equal(env.RUNNER_ENVIRONMENT, "github-hosted", "Self-hosted runners are not disposable installation targets")
  assert.ok(env.RUNNER_TEMP && path.isAbsolute(env.RUNNER_TEMP), "Absolute RUNNER_TEMP is required")
  assert.ok(BASELINES[target], "Unsupported native target")
  assert.equal(
    target,
    `${process.platform}-${process.arch}`,
    "Qualification must use the actual target OS/architecture",
  )
  assert.match(env.GITHUB_SHA ?? "", /^[a-f0-9]{40}$/)
}
const command = (tool, args, env = process.env) =>
  execFileSync(tool, args, { encoding: "utf8", timeout: 600000, stdio: "pipe", shell: false, env })
export function prepareCanonicalAuthFixture(
  runtimeRoot,
  authFile,
  referenceFile,
  { run = command, env = process.env } = {},
) {
  const node = path.join(runtimeRoot, "node", "bin", process.platform === "win32" ? "node.exe" : "node")
  const args = [
    "--disable-warning=ExperimentalWarning",
    path.join(runtimeRoot, "lib", "index-node-tui.js"),
    "providers",
    "auth",
    "export",
    "--file",
    referenceFile,
  ]
  let canonical
  for (let read = 0; read < 2; read++) {
    // Auth's first read migrates plaintext fixtures and creates its encryption canary.
    // Use the runtime-owned migration, then require readable credentials and stable bytes.
    run(node, args, env)
    const references = JSON.parse(fs.readFileSync(referenceFile, "utf8"))
    assert.deepEqual(
      references.providers?.qualification,
      { type: "summary", summary: "api" },
      "Synthetic credential is not readable",
    )
    if (canonical) verifyPreserved([canonical])
    else canonical = capturePreservedFile(authFile)
  }
  return canonical
}
export const writeSyntheticIfAbsent = (file, bytes) => {
  const flags = fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY
  let fd
  try {
    fd = fs.openSync(file, flags, 0o600)
  } catch (error) {
    if (error?.code === "EEXIST") return false
    throw error
  }
  try {
    fs.writeFileSync(fd, bytes)
  } finally {
    fs.closeSync(fd)
  }
  return true
}
export function writeSyntheticAuthFixture(file, bytes) {
  if (writeSyntheticIfAbsent(file, bytes)) return
  // Earlier GUI smoke can create a canary-only store. It contains no credentials.
  capturePreservedFile(file)
  const existing = JSON.parse(fs.readFileSync(file, "utf8"))
  assert.ok(
    existing &&
      typeof existing === "object" &&
      !Array.isArray(existing) &&
      Object.keys(existing).every((key) => key === "__canary"),
    "Refusing to replace a nonempty credential store with a synthetic fixture",
  )
  fs.writeFileSync(file, bytes, { mode: 0o600 })
}
export function readInstalledVersion(archive) {
  // Every installation replaces this path; ASAR caches headers by pathname.
  asar.uncache(archive)
  return JSON.parse(asar.extractFile(archive, "package.json").toString()).version
}
const verifyMinisign = (file) => command("minisign", ["-Vm", file, "-P", KEY])

async function qualify(target, artifacts, output) {
  assertHostedRunner(process.env, target)
  const root = fs.mkdtempSync(path.join(process.env.RUNNER_TEMP, "desktop-native-install-"))
  const baselineName = BASELINES[target][0]
  command("gh", [
    "release",
    "download",
    BASELINE_TAG,
    "--repo",
    "defai-digital/ax-code-desktop",
    "--pattern",
    baselineName,
    "--pattern",
    `${baselineName}.minisig`,
    "--dir",
    root,
  ])
  const baseline = path.join(root, baselineName)
  assert.equal(digest(baseline), BASELINES[target][1], "Historical baseline digest mismatch")
  verifyMinisign(baseline)
  const version = qualificationVersion()
  const candidateName =
    target === "darwin-arm64"
      ? `AX-Code-${version}-mac-arm64.dmg`
      : target === "win32-x64"
        ? `AX-Code-${version}-win-x64.exe`
        : `AX-Code-${version}-linux-${target.endsWith("x64") ? "amd64" : "arm64"}.deb`
  const candidate = path.resolve(artifacts, candidateName)
  verifyMinisign(candidate)
  const profile =
    process.platform === "darwin"
      ? path.join(os.homedir(), "Library/Application Support/AX Code")
      : process.platform === "win32"
        ? path.join(process.env.APPDATA, "AX Code")
        : path.join(os.homedir(), ".config/AX Code")
  const config = path.join(os.homedir(), ".config/ax-code")
  for (const directory of [profile, config]) {
    fs.mkdirSync(directory, { recursive: true })
  }
  // Synthetic configuration values, not real provider credentials. Evidence stores hashes only.
  const authDirectory = path.join(os.homedir(), ".local/share/ax-code")
  fs.mkdirSync(authDirectory, { recursive: true })
  const syntheticFiles = [
    [path.join(profile, "language-preferences.json"), '{"language":"en"}\n'],
    [
      path.join(authDirectory, "auth.json"),
      JSON.stringify({ qualification: { type: "api", key: crypto.randomBytes(32).toString("hex") } }),
    ],
    [
      path.join(config, "ax-code.json"),
      '{"$schema":"https://ax-code.app/docs-assets/schema/config.schema.json","provider":{}}\n',
    ],
  ]
  for (const [file, bytes] of syntheticFiles) {
    if (file === path.join(authDirectory, "auth.json")) writeSyntheticAuthFixture(file, bytes)
    else writeSyntheticIfAbsent(file, bytes)
  }
  prepareCanonicalAuthFixture(
    fileURLToPath(new URL("../desktop/packages/electron/resources/ax-code/", import.meta.url)),
    path.join(authDirectory, "auth.json"),
    path.join(root, "credential-references.json"),
  )
  const records = syntheticFiles.map(([file]) => capturePreservedFile(file))
  let installed
  let executable
  let packageName
  if (process.platform === "darwin") {
    installed = "/Applications/AX Code.app"
    assert.ok(!fs.existsSync(installed), "Runner already has AX Code installed")
    executable = path.join(installed, "Contents/MacOS/AX Code")
  } else if (process.platform === "win32") {
    installed = path.join(root, "AX Code installed with spaces")
    executable = path.join(installed, "AX Code.exe")
    command(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        '$s=Get-AuthenticodeSignature -LiteralPath $env:AX_QUAL_INSTALLER; if ($s.Status -ne "Valid" -or $s.SignerCertificate.Thumbprint -ne "FC40F1109912C025E751E804AA9BD1538A2D12EF" -or $null -eq $s.TimeStamperCertificate) { throw "Candidate installer signature failed" }',
      ],
      { ...process.env, AX_QUAL_INSTALLER: candidate },
    )
  } else {
    packageName = command("dpkg-deb", ["--field", candidate, "Package"]).trim()
    assert.equal(packageName, "ax-code-desktop")
    assert.equal(command("dpkg-deb", ["--field", baseline, "Package"]).trim(), packageName)
    let prior = ""
    try {
      prior = command("dpkg-query", ["-W", "-f=${Status}", "ax-code-desktop"]).trim()
    } catch {
      prior = ""
    }
    assert.ok(!prior.includes("install ok installed"), "Runner already has Desktop installed")
    installed = "/opt/AX Code"
    executable = path.join(installed, "ax-code-desktop")
  }
  const receipts = []
  for (const [step, selection] of TRANSITIONS) {
    const file = selection === "candidate" ? candidate : baseline
    const expectedVersion = selection === "candidate" ? version : BASELINE_VERSION
    if (process.platform === "darwin") {
      const mount = path.join(root, "mount")
      fs.mkdirSync(mount, { recursive: true })
      command("hdiutil", ["attach", "-nobrowse", "-readonly", "-mountpoint", mount, file])
      try {
        const app = path.join(mount, "AX Code.app")
        assert.ok(fs.existsSync(app), "Installer does not contain the frozen app name")
        if (selection === "candidate") {
          command("codesign", ["--verify", "--deep", "--strict", app])
          command("spctl", ["--assess", "--type", "execute", app])
          command("xcrun", ["stapler", "validate", app])
        }
        const stage = path.join(root, "AX Code.app")
        command("ditto", [app, stage])
        command("sudo", ["rm", "-rf", installed])
        command("sudo", ["ditto", stage, installed])
        fs.rmSync(stage, { recursive: true, force: true })
      } finally {
        try {
          command("hdiutil", ["detach", mount])
        } catch (error) {
          // A failed detach (usually a busy volume) must not replace the failure being unwound: the
          // job then reported an unmount problem instead of the signature or copy that broke, and the
          // real cause was lost with it.
          console.warn("Failed to detach the installer volume:", error instanceof Error ? error.message : String(error))
        }
      }
      assert.equal(
        command("/usr/libexec/PlistBuddy", [
          "-c",
          "Print CFBundleShortVersionString",
          path.join(installed, "Contents/Info.plist"),
        ]).trim(),
        expectedVersion,
      )
    } else if (process.platform === "win32") {
      command(file, ["/S", "/currentuser", `/D=${installed}`])
    } else {
      command("sudo", ["apt-get", "install", "-y", "--allow-downgrades", file])
      assert.equal(command("dpkg-query", ["-W", "-f=${Version}", packageName]).trim(), expectedVersion)
    }
    const archive =
      process.platform === "darwin"
        ? path.join(installed, "Contents/Resources/app.asar")
        : path.join(installed, "resources/app.asar")
    assert.equal(readInstalledVersion(archive), expectedVersion, "Installed archive version mismatch")
    verifyPreserved(records)
    if (selection === "candidate")
      await runSmoke([], {
        platform: process.platform,
        arch: process.arch,
        appPath: process.platform === "darwin" ? installed : executable,
      })
    const installedGui =
      selection === "candidate" && process.platform === "win32"
        ? await runWindowsInstalledGuiSmoke(executable)
        : undefined
    verifyPreserved(records)
    receipts.push({
      step,
      version: expectedVersion,
      profilePreserved: true,
      configurationPreserved: true,
      ...(process.platform === "win32" ? {} : { posixCredentialMetadataPreserved: true }),
      installedArchiveSha256: digest(archive),
      ...(installedGui ? { installedGui } : {}),
      installedSmoke: selection === "candidate" ? "passed" : "baseline-not-executed",
    })
  }
  fs.mkdirSync(path.dirname(output), { recursive: true })
  fs.writeFileSync(
    output,
    JSON.stringify(
      {
        schema: "ax-code-desktop.native-installation.v1",
        commit: process.env.GITHUB_SHA,
        version,
        target,
        baselineVersion: BASELINE_VERSION,
        baselineSha256: digest(baseline),
        installerSha256: digest(candidate),
        checks: receipts,
        continuityScope:
          "Installer preserves existing profile and synthetic provider configuration bytes; candidate installed ASAR CLI/UI smoke passes. No real credentials are used.",
      },
      null,
      2,
    ) + "\n",
  )
  console.log(`Native installer qualification passed: ${target}`)
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  qualify(process.argv[2], process.argv[3], path.resolve(process.argv[4])).catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}
