#!/usr/bin/env tsx

import { createHash } from "node:crypto"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const publisher = "DEFAI"
const copyright = "Copyright (c) DEFAI Private Limited"

export type Args = {
  version: string
  out: string
  skipDownload: boolean
  tag: string
}

export function parseArgs(argv: string[]): Args {
  let version = ""
  let out = path.join(".tmp", "winget")
  let skipDownload = false
  let tag = ""

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--version" || arg === "-v") version = argv[++index] ?? ""
    else if (arg === "--out" || arg === "-o") out = argv[++index] ?? out
    else if (arg === "--tag") tag = argv[++index] ?? ""
    else if (arg === "--skip-download") skipDownload = true
    else if (arg === "--help" || arg === "-h") {
      throw new Error("Usage: generate-manifests.ts --version <semver> [--tag <tag>] [--out <dir>] [--skip-download]")
    } else {
      throw new Error(`unknown argument: ${arg}`)
    }
  }

  const normalizedVersion = version.replace(/^desktop-v/, "").replace(/^v/, "")
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(normalizedVersion)) {
    throw new Error("--version must be a semantic version")
  }
  return { version: normalizedVersion, out, skipDownload, tag }
}

function readReleaseContract() {
  const policy = JSON.parse(readFileSync(path.join(root, "config/desktop-release-policy.json"), "utf8"))
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(policy.publicRelease?.repository ?? "")) {
    throw new Error("Desktop release repository must be owner/name")
  }
  if (typeof policy.publicRelease?.tagPrefix !== "string" || policy.publicRelease.tagPrefix.length === 0) {
    throw new Error("Desktop release tag prefix is missing")
  }
  return {
    repository: policy.publicRelease.repository as string,
    tagPrefix: policy.publicRelease.tagPrefix as string,
  }
}

async function sha256Url(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { "User-Agent": "ax-coder-winget-manifest-generator" },
    redirect: "follow",
  })
  if (!response.ok) throw new Error(`Failed to download ${url}: HTTP ${response.status}`)
  return createHash("sha256")
    .update(Buffer.from(await response.arrayBuffer()))
    .digest("hex")
    .toUpperCase()
}

function writeYaml(file: string, lines: string[]) {
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, `${lines.join("\n")}\n`, "utf8")
}

export async function generateManifests(argv = process.argv.slice(2)) {
  const args = parseArgs(argv)
  const contract = readReleaseContract()
  const tag = args.tag || `${contract.tagPrefix}${args.version}`
  const base = `https://github.com/${contract.repository}/releases/download/${tag}`
  const assets = [{ arch: "x64", file: `AX-Code-${args.version}-win-x64.exe` }]
  const hashes = new Map<string, string>()

  for (const asset of assets) {
    hashes.set(asset.file, args.skipDownload ? "REPLACE_WITH_SHA256" : await sha256Url(`${base}/${asset.file}`))
  }

  const packageId = "DEFAI.AXCode.Desktop"
  const output = path.resolve(args.out, "manifests", "d", "DEFAI", "AXCode", "Desktop", args.version)
  const repositoryUrl = `https://github.com/${contract.repository}`

  writeYaml(path.join(output, `${packageId}.yaml`), [
    `PackageIdentifier: ${packageId}`,
    `PackageVersion: ${args.version}`,
    "DefaultLocale: en-US",
    "ManifestType: version",
    "ManifestVersion: 1.6.0",
  ])

  writeYaml(path.join(output, `${packageId}.locale.en-US.yaml`), [
    `PackageIdentifier: ${packageId}`,
    `PackageVersion: ${args.version}`,
    "PackageLocale: en-US",
    `Publisher: ${publisher}`,
    "PublisherUrl: https://github.com/defai-digital",
    `PublisherSupportUrl: ${repositoryUrl}/issues`,
    `Author: ${publisher}`,
    "PackageName: AX Code Desktop",
    `PackageUrl: ${repositoryUrl}`,
    "License: Apache-2.0",
    `LicenseUrl: ${repositoryUrl}/blob/main/LICENSE`,
    `Copyright: ${copyright}`,
    "ShortDescription: Desktop workspace for the AX Code agent runtime",
    "Description: AX Code Desktop is the graphical workspace for AX Code projects, sessions, reviews, Git, and terminals.",
    "Moniker: ax-code-desktop",
    "Tags:",
    "  - ai",
    "  - developer-tools",
    "  - code-assistant",
    "ManifestType: defaultLocale",
    "ManifestVersion: 1.6.0",
  ])

  const installers = assets.flatMap((asset) => [
    `  - Architecture: ${asset.arch}`,
    "    InstallerType: nullsoft",
    "    Scope: user",
    `    InstallerUrl: ${base}/${asset.file}`,
    `    InstallerSha256: ${hashes.get(asset.file)}`,
    "    UpgradeBehavior: install",
    "    AppsAndFeaturesEntries:",
    "      - DisplayName: AX Code",
    "        Publisher: DEFAI Private Limited",
  ])

  writeYaml(path.join(output, `${packageId}.installer.yaml`), [
    `PackageIdentifier: ${packageId}`,
    `PackageVersion: ${args.version}`,
    "Platform:",
    "  - Windows.Desktop",
    "MinimumOSVersion: 10.0.17763.0",
    "InstallerType: nullsoft",
    "Scope: user",
    "InstallModes:",
    "  - interactive",
    "  - silent",
    "  - silentWithProgress",
    "UpgradeBehavior: install",
    `ReleaseDate: ${new Date().toISOString().slice(0, 10)}`,
    "Installers:",
    ...installers,
    "ManifestType: installer",
    "ManifestVersion: 1.6.0",
  ])

  return { output, repository: contract.repository, tag }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  generateManifests()
    .then((result) => console.log(`Wrote Desktop winget manifests to ${result.output}`))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error)
      process.exitCode = 1
    })
}
