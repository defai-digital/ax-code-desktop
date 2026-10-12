#!/usr/bin/env node
import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { assertPublicReleaseAuthorized } from "../../script/release-policy.mjs"

export const BASE = "https://download.automatosx.com/ax-code-desktop"
export const KEY = "RWSlDu++afxCz01OqhYWhfo8+L8pVbSYXJBEb2zoWBuK0WACIzbGVZRO"
const directory = path.dirname(fileURLToPath(import.meta.url))
export const hash = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex")
const assert = (condition, message) => {
  if (!condition) throw new Error(message)
}
const safeName = (name) => typeof name === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,200}$/.test(name)

export function installers(version) {
  assert(/^\d+\.\d+\.\d+$/.test(version), "Expected a stable Desktop version")
  return {
    "darwin-arm64": `AX-Code-${version}-mac-arm64.dmg`,
    "win32-x64": `AX-Code-${version}-win-x64.exe`,
    "linux-x64": `AX-Code-${version}-linux-amd64.deb`,
    "linux-arm64": `AX-Code-${version}-linux-arm64.deb`,
  }
}

export function requiredAssets(version) {
  return [
    ...Object.values(installers(version)),
    `AX-Code-${version}-mac-arm64.zip`,
    `AX-Code-${version}-win-x64.zip`,
    `AX-Code-${version}-linux-x86_64.AppImage`,
    `AX-Code-${version}-linux-arm64.AppImage`,
    "latest-mac.yml",
    "latest.yml",
    "latest-linux.yml",
    "latest-linux-arm64.yml",
  ]
}

function bytes(file) {
  const stat = fs.lstatSync(file)
  assert(stat.isFile() && !stat.isSymbolicLink(), `Expected a regular file: ${file}`)
  return fs.readFileSync(file)
}

export function verifySignature(file) {
  bytes(file)
  bytes(`${file}.minisig`)
  execFileSync("minisign", ["-Vm", file, "-x", `${file}.minisig`, "-P", KEY], { stdio: ["ignore", "pipe", "pipe"] })
}

export function prepare({ source, output, version, commit, verify = verifySignature }) {
  assert(/^[a-f0-9]{40}$/.test(commit), "Expected an immutable source SHA")
  const primary = installers(version)
  assert(!fs.existsSync(output), "Output already exists; use a new preparation directory")
  const required = requiredAssets(version)
  const optional = required.filter((name) => /\.(zip|exe|dmg|AppImage)$/.test(name)).map((name) => `${name}.blockmap`)
  const inputs = required.map((name) => ({ name, source: path.join(source, name) }))
  // Shadow collection renames the Windows feed to avoid multi-platform collisions.
  for (const input of inputs) {
    if (input.name === "latest.yml" && !fs.existsSync(input.source))
      input.source = path.join(source, "latest-win-x64.yml")
  }
  for (const name of optional)
    if (fs.existsSync(path.join(source, name))) inputs.push({ name, source: path.join(source, name) })
  for (const input of inputs) {
    bytes(input.source)
    verify(input.source)
  }
  fs.mkdirSync(output, { recursive: true })
  for (const input of inputs) {
    fs.writeFileSync(path.join(output, input.name), bytes(input.source))
    fs.writeFileSync(path.join(output, `${input.name}.minisig`), bytes(`${input.source}.minisig`))
  }
  for (const name of ["install", "install.ps1"]) fs.copyFileSync(path.join(directory, name), path.join(output, name))
  const rows = Object.entries(primary).map(([target, name]) => {
    const content = bytes(path.join(output, name))
    return `${target}\t${name}\t${content.length}\t${hash(content)}`
  })
  const manifest = `release\tv${version}\t${commit}\n${rows.join("\n")}\n`
  fs.writeFileSync(path.join(output, "release.tsv"), manifest)
  fs.writeFileSync(path.join(output, "latest.txt"), `v${version}\n`)
  fs.writeFileSync(path.join(output, "release-ready.txt"), `v${version}\n${commit}\n${hash(manifest)}\n`)
  const inventory = {
    schema: "ax-code-desktop.download-inventory.v1",
    version,
    commit,
    assets: [...inputs.map((input) => input.name), "install", "install.ps1", "release.tsv", "latest.txt"]
      .sort()
      .map((name) => {
        const content = bytes(path.join(output, name))
        return { name, size: content.length, sha256: hash(content) }
      }),
  }
  fs.writeFileSync(path.join(output, "inventory.json"), `${JSON.stringify(inventory, null, 2)}\n`)
  return inventory
}

export function verifyDirectory(source, verify = verifySignature) {
  verify(path.join(source, "inventory.json"))
  const inventory = JSON.parse(bytes(path.join(source, "inventory.json")))
  assert(inventory.schema === "ax-code-desktop.download-inventory.v1", "Invalid inventory schema")
  assert(/^[a-f0-9]{40}$/.test(inventory.commit), "Invalid inventory source SHA")
  const required = [...requiredAssets(inventory.version), "install", "install.ps1", "release.tsv", "latest.txt"]
  const optional = required.filter((name) => /\.(zip|exe|dmg|AppImage)$/.test(name)).map((name) => `${name}.blockmap`)
  assert(Array.isArray(inventory.assets), "Missing inventory")
  const seen = new Set()
  for (const asset of inventory.assets) {
    assert(safeName(asset.name) && !seen.has(asset.name), "Unsafe or duplicate inventory filename")
    assert([...required, ...optional].includes(asset.name), `Unexpected release asset: ${asset.name}`)
    seen.add(asset.name)
    const file = path.join(source, asset.name)
    const content = bytes(file)
    assert(
      Number.isSafeInteger(asset.size) && asset.size > 0 && content.length === asset.size,
      `Size mismatch: ${asset.name}`,
    )
    assert(/^[a-f0-9]{64}$/.test(asset.sha256) && hash(content) === asset.sha256, `SHA-256 mismatch: ${asset.name}`)
    verify(file)
  }
  assert(
    required.every((name) => seen.has(name)),
    "Incomplete release inventory",
  )
  const manifest = bytes(path.join(source, "release.tsv"))
  const expected =
    `release\tv${inventory.version}\t${inventory.commit}\n` +
    Object.entries(installers(inventory.version))
      .map(([target, name]) => {
        const asset = inventory.assets.find((item) => item.name === name)
        return `${target}\t${name}\t${asset.size}\t${asset.sha256}\n`
      })
      .join("")
  assert(manifest.toString() === expected, "Installer manifest does not match inventory")
  assert(
    bytes(path.join(source, "latest.txt")).toString() === `v${inventory.version}\n`,
    "Latest pointer does not match inventory",
  )
  verify(path.join(source, "release-ready.txt"))
  assert(
    bytes(path.join(source, "release-ready.txt")).toString() ===
      `v${inventory.version}\n${inventory.commit}\n${hash(manifest)}\n`,
    "Readiness marker does not match inventory",
  )
  return inventory
}

export function validateQualification(record, inventory) {
  assert(record?.schema === "ax-code-desktop.download-qualification.v1", "Invalid qualification schema")
  assert(
    record.version === inventory.version && record.commit === inventory.commit,
    "Qualification source/version mismatch",
  )
  assert(record.inventorySha256 === inventory.digest, "Qualification must bind the exact signed inventory")
  for (const gate of ["signed-shadow", "upgrade", "rollback", "data-and-credential-continuity", "human-approval"]) {
    assert(
      record.gates?.[gate]?.verified === true &&
        typeof record.gates[gate].evidence === "string" &&
        record.gates[gate].evidence.length > 0,
      `Missing qualified gate: ${gate}`,
    )
  }
  for (const target of Object.keys(installers(inventory.version))) {
    assert(
      record.platforms?.[target]?.verified === true &&
        typeof record.platforms[target].evidence === "string" &&
        record.platforms[target].evidence.length > 0,
      `Missing platform qualification: ${target}`,
    )
  }
}

async function publicBytes(key, fetcher) {
  const response = await fetcher(`${BASE}/${key}`, {
    headers: { "Cache-Control": "no-cache" },
    signal: AbortSignal.timeout(600000),
  })
  if (response.status === 404) return null
  assert(response.ok, `Public verification failed: HTTP ${response.status}`)
  return Buffer.from(await response.arrayBuffer())
}

export async function putVerified(key, content, { mutable = false, fetcher = fetch, account, token }) {
  assert(/^[A-Za-z0-9/_\-.]+$/.test(key) && !key.split("/").includes(".."), "Invalid object key")
  const previous = await publicBytes(key, fetcher)
  if (previous?.equals(content)) return
  assert(previous === null || mutable, `Refusing to overwrite immutable object: ${key}`)
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/r2/buckets/ax-code-desktop-releases/objects/${key}`
  const response = await fetcher(endpoint, {
    method: "PUT",
    body: content,
    signal: AbortSignal.timeout(600000),
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": key.endsWith(".json") ? "application/json" : "application/octet-stream",
      "Cache-Control": mutable ? "no-store" : "public, max-age=31536000, immutable",
    },
  })
  assert(response.ok, `R2 upload failed: HTTP ${response.status}`)
  const actual = await publicBytes(key, fetcher)
  assert(actual?.equals(content), `Public bytes differ from uploaded object: ${key}`)
}

export async function upload(source, qualificationFile) {
  // Check policy before any credential access, network request or upload.
  assertPublicReleaseAuthorized()
  const inventory = verifyDirectory(source)
  verifySignature(qualificationFile)
  validateQualification(JSON.parse(bytes(qualificationFile)), {
    ...inventory,
    digest: hash(bytes(path.join(source, "inventory.json"))),
  })
  const account = process.env.CLOUDFLARE_ACCOUNT_ID
  const token = process.env.CLOUDFLARE_API_TOKEN
  assert(/^[a-f0-9]{32}$/.test(account ?? "") && token, "CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required")
  const options = { account, token }
  const prefix = `releases/download/v${inventory.version}/`
  const names = [...inventory.assets.map((asset) => asset.name), "inventory.json"]
  for (const name of names)
    for (const suffix of ["", ".minisig"])
      await putVerified(prefix + name + suffix, bytes(path.join(source, name + suffix)), options)
  // Publish readiness last in the immutable version. Pointer is always last globally.
  for (const suffix of [".minisig", ""])
    await putVerified(
      prefix + "release-ready.txt" + suffix,
      bytes(path.join(source, "release-ready.txt" + suffix)),
      options,
    )
  for (const name of ["install", "install.ps1", "latest.txt"]) {
    for (const suffix of [".minisig", ""])
      await putVerified(name + suffix, bytes(path.join(source, name + suffix)), { ...options, mutable: true })
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  try {
    const [command, ...argv] = process.argv.slice(2)
    assert(
      ["prepare", "verify", "upload"].includes(command),
      "usage: distribution.mjs prepare|verify|upload --source <dir> [--out <dir> --version X.Y.Z --commit SHA | --qualification <signed-json>]",
    )
    const args = {}
    for (let index = 0; index < argv.length; index += 2) {
      const flag = argv[index]
      assert(
        ["--source", "--out", "--version", "--commit", "--qualification"].includes(flag) &&
          argv[index + 1] &&
          !Object.hasOwn(args, flag),
        `Invalid argument: ${flag}`,
      )
      args[flag] = argv[index + 1]
    }
    assert(args["--source"], "--source is required")
    const source = path.resolve(args["--source"])
    if (command === "prepare") {
      assert(args["--out"], "--out is required")
      const inventory = prepare({
        source,
        output: path.resolve(args["--out"]),
        version: args["--version"],
        commit: args["--commit"],
      })
      console.log(
        `Prepared ${inventory.assets.length} assets; sign generated metadata and bootstrap files before verification. Nothing was published.`,
      )
    } else if (command === "verify") {
      const inventory = verifyDirectory(source)
      console.log(`Verified Desktop ${inventory.version} (${inventory.commit}). Nothing was published.`)
    } else {
      assert(args["--qualification"], "--qualification is required")
      await upload(source, path.resolve(args["--qualification"]))
      console.log("Uploaded immutable Desktop assets, verified anonymous bytes and advanced the signed latest pointer.")
    }
  } catch (error) {
    // Never log credential values or HTTP bodies from authenticated APIs.
    console.error(error instanceof Error ? error.message : "Desktop distribution failed")
    process.exitCode = 1
  }
}
