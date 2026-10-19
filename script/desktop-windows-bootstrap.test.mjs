import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { afterEach, describe, it, expect } from "vitest"
import { hash, installers } from "../.internal/deploy/distribution.mjs"

// A case can run two bounded PowerShell processes; cold startup can exceed Vitest's 5s default.
const POWERSHELL_TIMEOUT_MS = 30_000
const BOOTSTRAP_TEST_TIMEOUT_MS = 2 * POWERSHELL_TIMEOUT_MS + 5_000
const pwsh = process.env.AX_DESKTOP_TEST_PWSH || "pwsh"
const available = spawnSync(pwsh, ["-NoProfile", "-NonInteractive", "-Command", "exit 0"]).status === 0
const original = fs.readFileSync(new URL("../.internal/deploy/install.ps1", import.meta.url), "utf8")
const temporary = []
afterEach(() => {
  for (const directory of temporary.splice(0)) fs.rmSync(directory, { recursive: true, force: true })
})
const quote = (value) => `'${value.replaceAll("'", "''")}'`

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ax-desktop-windows-bootstrap-test-"))
  temporary.push(directory)
  const files = path.join(directory, "files")
  fs.mkdirSync(files)
  const put = (name, content) => {
    fs.writeFileSync(path.join(files, name), content)
    fs.writeFileSync(path.join(files, `${name}.minisig`), "valid")
  }
  const rows = Object.entries(installers("7.24.5")).map(([target, name]) => {
    put(name, name)
    return `${target}\t${name}\t${Buffer.byteLength(name)}\t${hash(name)}`
  })
  const commit = "a".repeat(40)
  const manifest = `release\tv7.24.5\t${commit}\n${rows.join("\n")}\n`
  put("latest.txt", "v7.24.5\n")
  put("release.tsv", manifest)
  put("release-ready.txt", `v7.24.5\n${commit}\n${hash(manifest)}\n`)
  const verifier = path.join(directory, "verifier.ps1")
  fs.writeFileSync(verifier, 'if ([IO.File]::ReadAllText($args[3]) -ne "valid") { exit 1 }; exit 0\n')
  put("minisign-0.12-win64.zip", "mock-verifier-archive")
  const installed = path.join(directory, "installed")
  const harness = `
$env:OS = 'Windows_NT'
$env:PROCESSOR_ARCHITECTURE = 'AMD64'
$env:PROCESSOR_ARCHITEW6432 = ''
function Invoke-WebRequest {
  param([switch]$UseBasicParsing, [string]$Uri, [string]$OutFile, [int]$MaximumRedirection, [int]$TimeoutSec)
  Copy-Item -LiteralPath (Join-Path ${quote(files)} ([Uri]$Uri).Segments[-1]) -Destination $OutFile
}
function Expand-Archive { param([string]$LiteralPath, [string]$DestinationPath) }
function Get-AuthenticodeSignature {
  param([string]$LiteralPath)
  return @{ Status = 'Valid'; SignerCertificate = @{ Thumbprint = 'FC40F1109912C025E751E804AA9BD1538A2D12EF' } }
}
function Get-Process { param([string]$Name, [string]$ErrorAction) }
function Start-Process {
  param([string]$FilePath, [switch]$PassThru)
  [IO.File]::WriteAllText(${quote(installed)}, $FilePath)
  return [pscustomobject]@{ ExitCode = 0; Handle = 1 } | Add-Member -MemberType ScriptMethod -Name WaitForExit -Value {} -PassThru
}
`
  // Native OS/API and signatures are mocked; parsing, hashing and validation run in real PowerShell.
  let source = original
  const start = source.indexOf("# Read the native OS architecture")
  const end = source.indexOf("[Net.ServicePointManager]", start)
  if (process.platform !== "win32") source = source.slice(0, start) + source.slice(end)
  source = source.replace(
    "37b600344e20c19314b2e82813db2bfdcc408b77b876f7727889dbd46d539479",
    hash("mock-verifier-archive"),
  )
  source = source.replace(
    "$Verifier = Join-Path $Temporary 'verifier/minisign-win64/x86_64/minisign.exe'",
    `$Verifier = ${quote(verifier)}`,
  )
  const script = path.join(directory, "install.ps1")
  const run = (transform = (value) => value) => {
    fs.writeFileSync(script, transform(harness + source))
    return spawnSync(pwsh, ["-NoProfile", "-NonInteractive", "-File", script], {
      encoding: "utf8",
      timeout: POWERSHELL_TIMEOUT_MS,
    })
  }
  return { files, installed, run }
}

describe("Windows bootstrap output contract (source-level)", () => {
  it("suppresses the PowerShell 5.1 progress bar that freezes large downloads", () => {
    expect(original).toContain("$ProgressPreference = 'SilentlyContinue'")
  })
  it("stays ASCII so Windows PowerShell 5.1 decodes the irm | iex download unchanged", () => {
    expect(original).toMatch(/^[\x00-\x7F]*$/)
  })
  it("waits for the installer process rather than its whole job, which includes the launched app", () => {
    expect(original).not.toMatch(/Start-Process[^\n]*-Wait/)
    expect(original).toContain("$Process.WaitForExit()")
  })
  it("prints progress while resolving, downloading, and opening the installer", () => {
    expect(original).toContain("resolving the latest signed release")
    expect(original).toMatch(/Write-Output "AX Code Desktop: downloading AX-Code-/)
    expect(original).toContain("opening the installer")
  })
})

describe.skipIf(!available)("Windows bootstrap validation in PowerShell (mocked OS and signatures)", () => {
  it(
    "launches NSIS only after consistent metadata and artifact verification",
    () => {
      const { run, installed } = fixture()
      const result = run()
      expect(result.status, result.stderr).toBe(0)
      expect(fs.readFileSync(installed, "utf8")).toContain("win-x64.exe")
    },
    BOOTSTRAP_TEST_TIMEOUT_MS,
  )
  it(
    "preserves installation success and verification failure when cleanup is temporarily denied",
    () => {
      const { run, files } = fixture()
      const denyCleanup = (source) =>
        `
function Remove-Item {
  param([string]$LiteralPath, [switch]$Recurse, [switch]$Force, [string]$ErrorAction)
  Write-Error 'Simulated installer file lock' -ErrorAction $ErrorAction
}
` + source
      expect(run(denyCleanup).status).toBe(0)
      fs.writeFileSync(path.join(files, "latest.txt.minisig"), "invalid")
      const failed = run(denyCleanup)
      expect(failed.status).not.toBe(0)
      expect(failed.stderr).toContain("Invalid release signature")
      expect(failed.stderr).not.toContain("Simulated installer file lock")
    },
    BOOTSTRAP_TEST_TIMEOUT_MS,
  )

  it(
    "rejects Windows ARM64, including emulated x64 processes",
    () => {
      const { run, installed } = fixture()
      const result = run((source) =>
        source.replace("$env:PROCESSOR_ARCHITEW6432 = ''", "$env:PROCESSOR_ARCHITEW6432 = 'ARM64'"),
      )
      expect(result.status).not.toBe(0)
      expect(result.stderr).toContain("Windows ARM64")
      expect(result.stderr).toContain("unsupported")
      expect(fs.existsSync(installed)).toBe(false)
    },
    BOOTSTRAP_TEST_TIMEOUT_MS,
  )
  it(
    "rejects a different Authenticode certificate",
    () => {
      const { run, installed } = fixture()
      const result = run((source) =>
        source.replace("Thumbprint = 'FC40F1109912C025E751E804AA9BD1538A2D12EF'", "Thumbprint = 'untrusted'"),
      )
      expect(result.stderr).toContain("Unexpected Windows Authenticode signature")
      expect(fs.existsSync(installed)).toBe(false)
    },
    BOOTSTRAP_TEST_TIMEOUT_MS,
  )
  it(
    "rejects altered payloads and stale readiness before starting NSIS",
    () => {
      const { run, files, installed } = fixture()
      const file = path.join(files, installers("7.24.5")["win32-x64"])
      const originalContent = fs.readFileSync(file)
      const altered = Buffer.from(originalContent)
      altered[0] = 0
      fs.writeFileSync(file, altered)
      expect(run().stderr).toContain("SHA-256 mismatch")
      fs.writeFileSync(file, originalContent)
      fs.writeFileSync(path.join(files, "release-ready.txt"), "old-marker")
      expect(run().stderr).toContain("not ready")
      expect(fs.existsSync(installed)).toBe(false)
    },
    BOOTSTRAP_TEST_TIMEOUT_MS,
  )
})
