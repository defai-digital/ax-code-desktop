"use strict"

const fs = require("node:fs")
const path = require("node:path")
const crypto = require("node:crypto")
const {
  parseExpectedManifest,
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

async function trustedStartupFilesMatch(runtimeRoot, expected, platform) {
  const paths = [platform === "win32" ? "bin/ax-code.cmd" : "bin/ax-code", "package.json"]
  for (const relative of paths) {
    const entry = expected.get(relative)
    if (entry?.type !== "file") return false
    try {
      const file = path.join(runtimeRoot, relative)
      const stat = await fs.promises.lstat(file)
      if (!stat.isFile() || stat.size !== entry.size) return false
      const bytes = await fs.promises.readFile(file)
      if (bytes.length !== entry.size || crypto.createHash("sha256").update(bytes).digest("hex") !== entry.sha256) {
        return false
      }
    } catch {
      return false
    }
  }
  return true
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

// Without receipt options this fully hashes before resolving, like the sync
// verifier. A receipt hit moves the full scan behind the foreground launch gate.
async function verifyBundledAxCodeIntegrityAsync(options = {}) {
  const started = performance.now()
  const inspected = inspectBundledAxCode(options)
  if (inspected.result) return inspected.result
  const { runtimeRoot, trustedManifest } = inspected
  const {
    receiptFile,
    appVersion,
    platform = process.platform,
    onIntegrityFailure,
    verifyFull = verifyRuntimeManifestAsync,
  } = options
  const expected = parseExpectedManifest(trustedManifest, EMBEDDED_MANIFEST_NAME)
  const cacheEnabled = Boolean(receiptFile && appVersion)
  let receipt = null
  if (cacheEnabled) {
    receipt = {
      schema: RECEIPT_SCHEMA,
      appVersion,
      manifestDigest: crypto.createHash("sha256").update(canonicalJson(trustedManifest)).digest("hex"),
      runtimeRealpath: await fs.promises.realpath(runtimeRoot),
    }
  }
  let matches = false
  if (cacheEnabled) {
    try {
      const previous = JSON.parse(await fs.promises.readFile(receiptFile, "utf8"))
      matches = Object.keys(receipt).every((key) => previous?.[key] === receipt[key])
    } catch {
      // A missing, unreadable or incomplete receipt always requires a full scan.
    }
  }
  const fullVerify = () => verifyFull(runtimeRoot, { manifest: trustedManifest })
  if (matches && (await trustedStartupFilesMatch(runtimeRoot, expected, platform))) {
    // Keep this promise separate from the launch gate. Its failure revokes the
    // receipt and must stop any runtime the caller has already started.
    const backgroundVerification = Promise.resolve().then(async () => {
      try {
        await fullVerify()
        await writeReceipt(receiptFile, receipt)
      } catch (error) {
        try {
          await fs.promises.rm(receiptFile, { force: true })
        } finally {
          await onIntegrityFailure?.(error)
        }
      }
    })
    // Callers may observe completion, but need not await it to launch.
    backgroundVerification.catch((error) => console.error("[electron] integrity failure handling failed:", error))
    return {
      status: "verified",
      cache: "hit",
      runtimeRoot,
      entries: trustedManifest.files.length,
      durationMs: performance.now() - started,
      backgroundVerification,
    }
  }
  // Revoke a stale receipt before the scan, including when a startup file changed.
  if (cacheEnabled) await fs.promises.rm(receiptFile, { force: true })
  const manifest = await fullVerify()
  if (cacheEnabled) await writeReceipt(receiptFile, receipt)
  return {
    status: "verified",
    cache: "miss",
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
