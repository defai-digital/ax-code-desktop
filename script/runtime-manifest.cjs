"use strict"

const crypto = require("node:crypto")
const fs = require("node:fs")
const path = require("node:path")

const MANIFEST_NAME = "runtime-manifest.json"
const PE_EXTENSIONS = new Set([".dll", ".exe", ".node"])
const NATIVE_EXTENSIONS = new Set([...PE_EXTENSIONS, ".dylib", ".so"])
const NATIVE_MAGICS = new Set([
  "7f454c46", // ELF
  "cafebabe", // Mach-O universal (big endian)
  "cafebabf", // Mach-O universal 64-bit (big endian)
  "cefaedfe", // Mach-O 32-bit (little endian)
  "cffaedfe", // Mach-O 64-bit (little endian)
  "feedface", // Mach-O 32-bit (big endian)
  "feedfacf", // Mach-O 64-bit (big endian)
])

function isNativeBinary(relativePath, filePath) {
  if (NATIVE_EXTENSIONS.has(path.extname(relativePath).toLowerCase())) return true
  const descriptor = fs.openSync(filePath, "r")
  try {
    const magic = Buffer.alloc(4)
    const bytes = fs.readSync(descriptor, magic, 0, magic.length, 0)
    if (bytes >= 2 && magic[0] === 0x4d && magic[1] === 0x5a) return true // PE/COFF
    return bytes === magic.length && NATIVE_MAGICS.has(magic.toString("hex"))
  } finally {
    fs.closeSync(descriptor)
  }
}

function isWithin(root, candidate) {
  const relative = path.relative(root, candidate)
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))
}

function walkEntries(root, relative = "") {
  const directory = path.join(root, relative)
  const entries = fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))
  const files = []
  for (const entry of entries) {
    const child = relative ? path.join(relative, entry.name) : entry.name
    const full = path.join(root, child)
    if (entry.isSymbolicLink()) {
      const target = fs.readlinkSync(full)
      const resolvedTarget = path.resolve(path.dirname(full), target)
      let realTarget
      try {
        realTarget = fs.realpathSync(full)
      } catch {
        throw new Error(`Runtime manifest cannot include a broken symlink: ${child}`)
      }
      const realRoot = fs.realpathSync(root)
      if (path.isAbsolute(target) || !isWithin(path.resolve(root), resolvedTarget) || !isWithin(realRoot, realTarget)) {
        throw new Error(`Runtime manifest cannot include an external symlink: ${child}`)
      }
      files.push({ path: child, type: "symlink", target })
    } else if (entry.isDirectory()) {
      files.push(...walkEntries(root, child))
    } else if (entry.isFile()) {
      files.push({ path: child, type: "file" })
    }
  }
  return files
}

function walkFiles(root, relative = "") {
  return walkEntries(root, relative)
    .filter((entry) => entry.type === "file")
    .map((entry) => entry.path)
}

function hashFile(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex")
}

const ASYNC_CONCURRENCY = 16

const HASH_CHUNK_BYTES = 64 * 1024

// One open and one pass per file: the first chunk carries the 4-byte magic
// check and the rest streams into the hash through a fixed buffer, so peak
// memory stays at lanes x chunk instead of lanes x largest file.
// Returns null for native binaries, which the manifest deliberately omits.
async function readManifestFileAsync(relativePath, filePath) {
  if (NATIVE_EXTENSIONS.has(path.extname(relativePath).toLowerCase())) return null
  const handle = await fs.promises.open(filePath, "r")
  try {
    const chunk = Buffer.allocUnsafe(HASH_CHUNK_BYTES)
    const hash = crypto.createHash("sha256")
    let size = 0
    for (;;) {
      const { bytesRead } = await handle.read(chunk, 0, chunk.length, size)
      if (size === 0) {
        if (bytesRead >= 2 && chunk[0] === 0x4d && chunk[1] === 0x5a) return null // PE/COFF
        if (bytesRead >= 4 && NATIVE_MAGICS.has(chunk.subarray(0, 4).toString("hex"))) return null
      }
      if (bytesRead === 0) break
      hash.update(chunk.subarray(0, bytesRead))
      size += bytesRead
    }
    return { size, sha256: hash.digest("hex") }
  } finally {
    await handle.close()
  }
}

async function walkEntriesAsync(root, realRoot, relative = "") {
  const directory = path.join(root, relative)
  const entries = (await fs.promises.readdir(directory, { withFileTypes: true })).sort((a, b) =>
    a.name.localeCompare(b.name),
  )
  const files = []
  for (const entry of entries) {
    const child = relative ? path.join(relative, entry.name) : entry.name
    const full = path.join(root, child)
    if (entry.isSymbolicLink()) {
      const target = await fs.promises.readlink(full)
      const resolvedTarget = path.resolve(path.dirname(full), target)
      let realTarget
      try {
        realTarget = await fs.promises.realpath(full)
      } catch {
        throw new Error(`Runtime manifest cannot include a broken symlink: ${child}`)
      }
      if (path.isAbsolute(target) || !isWithin(path.resolve(root), resolvedTarget) || !isWithin(realRoot, realTarget)) {
        throw new Error(`Runtime manifest cannot include an external symlink: ${child}`)
      }
      files.push({ path: child, type: "symlink", target })
    } else if (entry.isDirectory()) {
      files.push(...(await walkEntriesAsync(root, realRoot, child)))
    } else if (entry.isFile()) {
      files.push({ path: child, type: "file" })
    }
  }
  return files
}

// Runs `worker` over `items` with bounded concurrency, preserving input order.
async function mapBounded(items, limit, worker) {
  const results = new Array(items.length)
  let next = 0
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await worker(items[index])
    }
  })
  await Promise.all(lanes)
  return results
}

// Same output as createRuntimeManifest, but never blocks the event loop on
// file I/O or hashing, so the Electron main thread stays responsive.
async function createRuntimeManifestAsync(runtimeRoot) {
  const realRoot = await fs.promises.realpath(runtimeRoot)
  const candidates = await walkEntriesAsync(runtimeRoot, realRoot)
  const entries = await mapBounded(
    candidates.filter((entry) => entry.path !== MANIFEST_NAME),
    ASYNC_CONCURRENCY,
    async (entry) => {
      const normalizedPath = entry.path.split(path.sep).join("/")
      if (entry.type === "symlink") return { path: normalizedPath, type: "symlink", target: entry.target }
      const file = path.join(runtimeRoot, entry.path)
      const content = await readManifestFileAsync(entry.path, file)
      return content ? { path: normalizedPath, type: "file", size: content.size, sha256: content.sha256 } : null
    },
  )
  const files = entries.filter(Boolean)

  if (!files.some((entry) => entry.path === "lib/index-node-tui.js" && entry.type === "file")) {
    throw new Error(`Runtime manifest is missing lib/index-node-tui.js: ${runtimeRoot}`)
  }

  return {
    schema: "ax-code.runtime-manifest.v1",
    algorithm: "sha256",
    files,
  }
}

function createRuntimeManifest(runtimeRoot) {
  const files = walkEntries(runtimeRoot)
    .filter(
      (entry) =>
        entry.path !== MANIFEST_NAME &&
        (entry.type === "symlink" || !isNativeBinary(entry.path, path.join(runtimeRoot, entry.path))),
    )
    .map((entry) => {
      const normalizedPath = entry.path.split(path.sep).join("/")
      if (entry.type === "symlink") {
        return {
          path: normalizedPath,
          type: "symlink",
          target: entry.target,
        }
      }
      const file = path.join(runtimeRoot, entry.path)
      return {
        path: normalizedPath,
        type: "file",
        size: fs.statSync(file).size,
        sha256: hashFile(file),
      }
    })

  if (!files.some((entry) => entry.path === "lib/index-node-tui.js" && entry.type === "file")) {
    throw new Error(`Runtime manifest is missing lib/index-node-tui.js: ${runtimeRoot}`)
  }

  return {
    schema: "ax-code.runtime-manifest.v1",
    algorithm: "sha256",
    files,
  }
}

function writeRuntimeManifest(runtimeRoot) {
  const manifest = createRuntimeManifest(runtimeRoot)
  fs.writeFileSync(path.join(runtimeRoot, MANIFEST_NAME), `${JSON.stringify(manifest, null, 2)}\n`)
  return manifest
}

function parseExpectedManifest(manifest, manifestPath) {
  if (manifest.schema !== "ax-code.runtime-manifest.v1" || manifest.algorithm !== "sha256") {
    throw new Error(`Unsupported runtime manifest schema: ${manifestPath}`)
  }
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    throw new Error(`Runtime manifest has no files: ${manifestPath}`)
  }

  const expected = new Map()
  for (const entry of manifest.files) {
    const normalizedPath = typeof entry?.path === "string" ? path.posix.normalize(entry.path) : ""
    if (
      !entry ||
      !normalizedPath ||
      normalizedPath !== entry.path ||
      normalizedPath === ".." ||
      normalizedPath.startsWith("../") ||
      path.posix.isAbsolute(normalizedPath) ||
      normalizedPath.includes("\\")
    ) {
      throw new Error(`Invalid runtime manifest path: ${String(entry?.path)}`)
    }
    if (entry.type === "symlink") {
      if (typeof entry.target !== "string" || !entry.target || path.isAbsolute(entry.target)) {
        throw new Error(`Invalid runtime manifest symlink: ${entry.path}`)
      }
    } else if (
      entry.type !== "file" ||
      NATIVE_EXTENSIONS.has(path.posix.extname(entry.path).toLowerCase()) ||
      !/^[a-f0-9]{64}$/.test(entry.sha256) ||
      !Number.isSafeInteger(entry.size) ||
      entry.size < 0
    ) {
      throw new Error(`Invalid runtime manifest entry: ${entry.path}`)
    }
    if (expected.has(entry.path)) throw new Error(`Duplicate runtime manifest entry: ${entry.path}`)
    expected.set(entry.path, entry)
  }
  return expected
}

function assertManifestMatches(expected, actual) {
  const actualByPath = new Map(actual.files.map((entry) => [entry.path, entry]))
  for (const [relativePath, entry] of expected) {
    const actualEntry = actualByPath.get(relativePath)
    const matches =
      actualEntry?.type === entry.type &&
      (entry.type === "symlink"
        ? actualEntry.target === entry.target
        : actualEntry.size === entry.size && actualEntry.sha256 === entry.sha256)
    if (!matches) {
      throw new Error(`Runtime manifest mismatch: ${relativePath}`)
    }
  }
  for (const relativePath of actualByPath.keys()) {
    if (!expected.has(relativePath)) throw new Error(`Runtime file is not listed in manifest: ${relativePath}`)
  }
}

function verifyRuntimeManifest(runtimeRoot, { readFile = fs.readFileSync, manifest: trustedManifest } = {}) {
  const manifestPath = path.join(runtimeRoot, MANIFEST_NAME)
  if (!trustedManifest && !fs.existsSync(manifestPath)) throw new Error(`Runtime manifest is missing: ${manifestPath}`)
  const manifest = trustedManifest || JSON.parse(readFile(manifestPath, "utf8"))
  const expected = parseExpectedManifest(manifest, manifestPath)
  assertManifestMatches(expected, createRuntimeManifest(runtimeRoot))
  return manifest
}

async function verifyRuntimeManifestAsync(runtimeRoot, { manifest: trustedManifest } = {}) {
  const manifestPath = path.join(runtimeRoot, MANIFEST_NAME)
  let manifest = trustedManifest
  if (!manifest) {
    try {
      manifest = JSON.parse(await fs.promises.readFile(manifestPath, "utf8"))
    } catch (error) {
      if (error?.code === "ENOENT") throw new Error(`Runtime manifest is missing: ${manifestPath}`)
      throw error
    }
  }
  const expected = parseExpectedManifest(manifest, manifestPath)
  assertManifestMatches(expected, await createRuntimeManifestAsync(runtimeRoot))
  return manifest
}

module.exports = {
  MANIFEST_NAME,
  NATIVE_EXTENSIONS,
  PE_EXTENSIONS,
  createRuntimeManifest,
  createRuntimeManifestAsync,
  isNativeBinary,
  verifyRuntimeManifest,
  verifyRuntimeManifestAsync,
  walkEntries,
  walkFiles,
  writeRuntimeManifest,
}
