#!/usr/bin/env node
import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import crypto from "node:crypto"
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
import { runSmoke } from "../desktop/packages/electron/scripts/smoke-packaged-asar-cli.mjs"

const require = createRequire(import.meta.url)
const asar = require("@electron/asar")
const KEY = "RWSlDu++afxCz01OqhYWhfo8+L8pVbSYXJBEb2zoWBuK0WACIzbGVZRO"
const BASELINE_TAG = "qualification-baseline-20261012-v7.10.2"
export const BASELINES = {
  "darwin-arm64": ["AX-Code-7.10.2-mac-arm64.dmg", "c49e3f390480ddf489c62f9167e18b5b3bafb4227bd4f7d5538de31b9aaba2f1"],
  "win32-x64": ["AX-Code-7.10.2-win-x64.exe", "00c87c8dfcb44b1e2eee786f003a7afc5354613e748213589debfcd1cbb06bf3"],
  "linux-x64": ["AX-Code-7.10.2-linux-amd64.deb", "888bf608105d5c8bf6b4690fdb436fb8eacc75ee33b8f92404841e78d5fa8dc7"],
  "linux-arm64": ["AX-Code-7.10.2-linux-arm64.deb", "17494ae01fbd582e0e2930df7e860ee83bab0a625e34196bb11ba0ff4da684ce"],
}
export const TRANSITIONS = [
  ["fresh-install", "candidate"],
  ["baseline-install", "baseline"],
  ["upgrade", "candidate"],
  ["rollback", "baseline"],
  ["final-install", "candidate"],
]
export const digest = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex")
export function verifyPreserved(records) {
  for (const { file, sha256 } of records)
    assert.equal(digest(file), sha256, `Installer changed profile/config bytes: ${file}`)
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
const command = (tool, args, options = {}) =>
  execFileSync(tool, args, { encoding: "utf8", timeout: 600000, stdio: "pipe", ...options })
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
  const version = JSON.parse(fs.readFileSync("package.json", "utf8")).version
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
  const records = [
    [path.join(profile, "language-preferences.json"), '{"language":"en"}\n'],
    [
      path.join(authDirectory, "auth.json"),
      JSON.stringify({ qualification: { type: "api", key: crypto.randomBytes(32).toString("hex") } }),
    ],
    [path.join(config, "ax-code.json"), '{"provider":{}}\n'],
  ].map(([file, bytes]) => {
    if (!fs.existsSync(file)) fs.writeFileSync(file, bytes, { mode: 0o600 })
    return { file, sha256: digest(file) }
  })
  let installed
  let executable
  let packageName
  if (process.platform === "darwin") {
    installed = "/Applications/AX Code.app"
    assert.ok(!fs.existsSync(installed), "Runner already has AX Code installed")
    executable = path.join(installed, "Contents/MacOS/AX Code")
  } else if (process.platform === "win32") {
    installed = path.join(root, "installed")
    executable = path.join(installed, "AX Code.exe")
    command(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        '$s=Get-AuthenticodeSignature -LiteralPath $env:AX_QUAL_INSTALLER; if ($s.Status -ne "Valid" -or $s.SignerCertificate.Thumbprint -ne "FC40F1109912C025E751E804AA9BD1538A2D12EF" -or $null -eq $s.TimeStamperCertificate) { throw "Candidate installer signature failed" }',
      ],
      { env: { ...process.env, AX_QUAL_INSTALLER: candidate } },
    )
  } else {
    packageName = command("dpkg-deb", ["--field", candidate, "Package"]).trim()
    assert.equal(packageName, "ax-code-desktop")
    assert.equal(command("dpkg-deb", ["--field", baseline, "Package"]).trim(), packageName)
    const prior = command("sh", ["-c", 'dpkg-query -W -f="${Status}" ax-code-desktop 2>/dev/null || true']).trim()
    assert.ok(!prior.includes("install ok installed"), "Runner already has Desktop installed")
    installed = "/opt/AX Code"
    executable = path.join(installed, "ax-code-desktop")
  }
  const receipts = []
  for (const [step, selection] of TRANSITIONS) {
    const file = selection === "candidate" ? candidate : baseline
    const expectedVersion = selection === "candidate" ? version : "7.10.2"
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
        command("hdiutil", ["detach", mount])
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
    const manifest = JSON.parse(asar.extractFile(archive, "package.json").toString())
    assert.equal(manifest.version, expectedVersion, "Installed archive version mismatch")
    verifyPreserved(records)
    if (selection === "candidate")
      await runSmoke([], {
        platform: process.platform,
        arch: process.arch,
        appPath: process.platform === "darwin" ? installed : executable,
      })
    receipts.push({
      step,
      version: expectedVersion,
      profilePreserved: true,
      configurationPreserved: true,
      installedArchiveSha256: digest(archive),
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
        baselineVersion: "7.10.2",
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
