"use strict"

const fs = require("node:fs")
const path = require("node:path")
const crypto = require("node:crypto")
const {
  verifyRuntimeManifest,
  verifyRuntimeManifestAsync,
} = require("../../../../script/runtime-manifest.cjs")

const EMBEDDED_MANIFEST_NAME = "ax-code-runtime-manifest.json"
const PLACEHOLDER_SCHEMA = "ax-code.runtime-manifest.placeholder.v1"
const RECEIPT_SCHEMA = "ax-code.runtime-integrity-receipt.v1"

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`
  }
  return JSON.stringify(value)
}

async function writeReceipt(receiptFile, receipt) {
  await fs.promises.mkdir(path.dirname(receiptFile), { recursive: true })
  const temporary = `${receiptFile}.${crypto.randomUUID()}.tmp`
  try {
    await fs.promises.writeFile(temporary, `${JSON.stringify(receipt)}\n`, { mode: 0o600 })
    await fs.promises.rename(temporary, receiptFile)
  } finally {
    await fs.promises.rm(temporary, { force: true })
  }
}

// Shared preflight: resolves everything cheap and decides whether the runtime
// tree has to be hashed at all. Returns a final result, or the inputs to verify.
function inspectBundledAxCode({
  platform = process.platform,
  isPackaged,
  appPath,
  resourcesPath,
  exists = fs.existsSync,
  readFile = fs.readFileSync,
} = {}) {
  if (!isPackaged) return { result: { status: "skipped", reason: "unpackaged" } }
  if (!appPath || !resourcesPath) throw new Error("Packaged application and resources paths are required")

  const runtimeRoot = path.join(resourcesPath, "ax-code")
  const launcher = path.join(runtimeRoot, "bin", platform === "win32" ? "ax-code.cmd" : "ax-code")
  const runtimePackage = path.join(runtimeRoot, "package.json")
  const trustedManifestPath = path.join(appPath, "dist", EMBEDDED_MANIFEST_NAME)
  if (!exists(trustedManifestPath)) {
    throw new Error(`Packaged ax-code runtime has no trusted ASAR manifest: ${trustedManifestPath}`)
  }

  let trustedManifest
  try {
    trustedManifest = JSON.parse(readFile(trustedManifestPath, "utf8"))
  } catch (error) {
    throw new Error(
      `Packaged ax-code runtime has an invalid trusted ASAR manifest: ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  if (trustedManifest?.schema === PLACEHOLDER_SCHEMA) {
    if (exists(launcher) || exists(runtimePackage)) {
      throw new Error("Packaged ax-code runtime is present but the trusted ASAR manifest authorizes only a placeholder")
    }
    return { result: { status: "skipped", reason: "runtime-not-staged", runtimeRoot } }
  }

  if (!exists(launcher) || !exists(runtimePackage)) {
    throw new Error(`Packaged ax-code runtime required by the trusted ASAR manifest is incomplete: ${runtimeRoot}`)
  }

  return { runtimeRoot, trustedManifest }
}

function verifyBundledAxCodeIntegrity(options = {}) {
  const inspected = inspectBundledAxCode(options)
  if (inspected.result) return inspected.result
  const { runtimeRoot, trustedManifest } = inspected
  const manifest = verifyRuntimeManifest(runtimeRoot, { manifest: trustedManifest })
  return { status: "verified", runtimeRoot, entries: manifest.files.length }
}

// Receipts are diagnostic metadata, never authorization to skip file hashes.
// Always await the full trusted-manifest scan before opening the launch gate.
async function verifyBundledAxCodeIntegrityAsync(options = {}) {
  const started = performance.now()
  const inspected = inspectBundledAxCode(options)
  if (inspected.result) return inspected.result
  const { runtimeRoot, trustedManifest } = inspected
  const { receiptFile, appVersion, verifyFull = verifyRuntimeManifestAsync } = options
  let receipt = null
  let matches = false
  if (receiptFile && appVersion) {
    try {
      receipt = {
        schema: RECEIPT_SCHEMA,
        appVersion,
        manifestDigest: crypto.createHash("sha256").update(canonicalJson(trustedManifest)).digest("hex"),
        runtimeRealpath: await fs.promises.realpath(runtimeRoot),
      }
      const previous = JSON.parse(await fs.promises.readFile(receiptFile, "utf8"))
      matches = Object.keys(receipt).every((key) => previous?.[key] === receipt[key])
    } catch {
      // Missing or unreadable diagnostic metadata does not weaken the full scan.
    }
  }
  let manifest
  try {
    manifest = await verifyFull(runtimeRoot, { manifest: trustedManifest })
  } catch (error) {
    if (receiptFile) {
      try {
        await fs.promises.rm(receiptFile, { force: true })
      } catch {
        console.warn("[electron] could not remove runtime integrity receipt; full verification remains required")
      }
    }
    throw error
  }
  if (receipt) {
    try {
      await writeReceipt(receiptFile, receipt)
    } catch {
      // Disk exhaustion or a locked receipt is not a runtime integrity failure.
      console.warn("[electron] could not write runtime integrity receipt; full verification remains required")
    }
  }
  return {
    status: "verified",
    cache: matches ? "hit" : "miss",
    runtimeRoot,
    entries: manifest.files.length,
    durationMs: performance.now() - started,
  }
}

module.exports = {
  EMBEDDED_MANIFEST_NAME,
  PLACEHOLDER_SCHEMA,
  RECEIPT_SCHEMA,
  verifyBundledAxCodeIntegrity,
  verifyBundledAxCodeIntegrityAsync,
}
