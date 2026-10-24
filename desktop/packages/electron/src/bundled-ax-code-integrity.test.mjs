import { afterEach, describe, expect, test, vi } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const {
  createRuntimeManifest,
  createRuntimeManifestAsync,
  writeRuntimeManifest,
  verifyRuntimeManifestAsync,
} = require("../../../../script/runtime-manifest.cjs")
const {
  EMBEDDED_MANIFEST_NAME,
  PLACEHOLDER_SCHEMA,
  RECEIPT_SCHEMA,
  verifyBundledAxCodeIntegrity,
  verifyBundledAxCodeIntegrityAsync,
} = require("./bundled-ax-code-integrity.js")
const tempDirs = []

afterEach(() => {
  for (const directory of tempDirs.splice(0)) fs.rmSync(directory, { recursive: true, force: true })
})

function makePackagedRuntime({ staged = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ax-bundled-integrity-"))
  tempDirs.push(root)
  const appPath = path.join(root, "app.asar")
  const resourcesPath = path.join(root, "resources")
  const runtimeRoot = path.join(resourcesPath, "ax-code")
  fs.mkdirSync(path.join(appPath, "dist"), { recursive: true })
  fs.mkdirSync(runtimeRoot, { recursive: true })
  if (staged) {
    fs.mkdirSync(path.join(runtimeRoot, "bin"), { recursive: true })
    fs.mkdirSync(path.join(runtimeRoot, "lib"), { recursive: true })
    fs.writeFileSync(path.join(runtimeRoot, "bin", "ax-code"), "#!/bin/sh\n")
    fs.writeFileSync(path.join(runtimeRoot, "lib", "index-node-tui.js"), "runtime\n")
    fs.writeFileSync(path.join(runtimeRoot, "package.json"), "{}\n")
    writeRuntimeManifest(runtimeRoot)
    fs.copyFileSync(path.join(runtimeRoot, "runtime-manifest.json"), path.join(appPath, "dist", EMBEDDED_MANIFEST_NAME))
  } else {
    fs.writeFileSync(
      path.join(appPath, "dist", EMBEDDED_MANIFEST_NAME),
      `${JSON.stringify({ schema: PLACEHOLDER_SCHEMA, reason: "runtime-not-staged" })}\n`,
    )
  }
  return { appPath, resourcesPath, runtimeRoot }
}

describe("bundled ax-code runtime integrity", () => {
  test("verifies the external runtime against the ASAR-trusted manifest", () => {
    const paths = makePackagedRuntime()
    expect(
      verifyBundledAxCodeIntegrity({
        platform: "darwin",
        isPackaged: true,
        appPath: paths.appPath,
        resourcesPath: paths.resourcesPath,
      }),
    ).toMatchObject({ status: "verified", entries: 3 })
  })

  test("rejects modified sidecar JavaScript before it can be spawned", () => {
    const paths = makePackagedRuntime()
    fs.appendFileSync(path.join(paths.runtimeRoot, "lib", "index-node-tui.js"), "modified\n")

    expect(() =>
      verifyBundledAxCodeIntegrity({
        platform: "darwin",
        isPackaged: true,
        appPath: paths.appPath,
        resourcesPath: paths.resourcesPath,
      }),
    ).toThrow("Runtime manifest mismatch: lib/index-node-tui.js")
  })

  test("fails closed when a required packaged runtime is removed", () => {
    const paths = makePackagedRuntime()
    fs.rmSync(path.join(paths.runtimeRoot, "bin", "ax-code"))

    expect(() =>
      verifyBundledAxCodeIntegrity({
        platform: "darwin",
        isPackaged: true,
        appPath: paths.appPath,
        resourcesPath: paths.resourcesPath,
      }),
    ).toThrow("required by the trusted ASAR manifest is incomplete")
  })

  test("skips a packaged placeholder build with no runtime", () => {
    const paths = makePackagedRuntime({ staged: false })
    expect(
      verifyBundledAxCodeIntegrity({
        platform: "darwin",
        isPackaged: true,
        appPath: paths.appPath,
        resourcesPath: paths.resourcesPath,
      }),
    ).toMatchObject({ status: "skipped", reason: "runtime-not-staged" })
  })

  test("rejects a runtime inserted into a placeholder build", () => {
    const paths = makePackagedRuntime({ staged: false })
    fs.mkdirSync(path.join(paths.runtimeRoot, "bin"), { recursive: true })
    fs.writeFileSync(path.join(paths.runtimeRoot, "bin", "ax-code"), "#!/bin/sh\n")

    expect(() =>
      verifyBundledAxCodeIntegrity({
        platform: "darwin",
        isPackaged: true,
        appPath: paths.appPath,
        resourcesPath: paths.resourcesPath,
      }),
    ).toThrow("trusted ASAR manifest authorizes only a placeholder")
  })
})

describe("bundled ax-code runtime integrity (async)", () => {
  const options = (paths) => ({
    platform: "darwin",
    isPackaged: true,
    appPath: paths.appPath,
    resourcesPath: paths.resourcesPath,
  })

  const cachedOptions = (paths) => ({
    ...options(paths),
    appVersion: "1.0.0",
    receiptFile: path.join(paths.resourcesPath, "receipts", "integrity.json"),
  })

  test("fully verifies a cache miss and writes a versioned, manifest-bound receipt", async () => {
    const paths = makePackagedRuntime()
    const config = cachedOptions(paths)
    const verifyFull = vi.fn(verifyRuntimeManifestAsync)
    await expect(verifyBundledAxCodeIntegrityAsync({ ...config, verifyFull })).resolves.toMatchObject({
      status: "verified", cache: "miss", entries: 3, durationMs: expect.any(Number),
    })
    expect(verifyFull).toHaveBeenCalledTimes(1)
    expect(JSON.parse(fs.readFileSync(config.receiptFile, "utf8"))).toEqual({
      schema: RECEIPT_SCHEMA,
      appVersion: "1.0.0",
      manifestDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
      runtimeRealpath: fs.realpathSync(paths.runtimeRoot),
    })
  })

  test("a matching receipt never opens the launch gate before the full scan completes", async () => {
    const paths = makePackagedRuntime()
    const config = cachedOptions(paths)
    await verifyBundledAxCodeIntegrityAsync(config)
    let release, entered
    const gate = new Promise((resolve) => { release = resolve })
    const scanning = new Promise((resolve) => { entered = resolve })
    const verifyFull = vi.fn(async (...args) => {
      entered()
      await gate
      return verifyRuntimeManifestAsync(...args)
    })
    let launchAllowed = false
    const pending = verifyBundledAxCodeIntegrityAsync({ ...config, verifyFull }).then((result) => {
      launchAllowed = true
      return result
    })
    try {
      await scanning
      await new Promise((resolve) => setImmediate(resolve))
      expect(launchAllowed).toBe(false)
    } finally {
      release()
      await pending
    }
    expect(await pending).toMatchObject({ status: "verified", cache: "hit", entries: 3 })
  })

  test("rejects a changed package.json on a hit by falling through to the full verifier", async () => {
    const paths = makePackagedRuntime()
    const config = cachedOptions(paths)
    await verifyBundledAxCodeIntegrityAsync(config)
    fs.writeFileSync(path.join(paths.runtimeRoot, "package.json"), "[]\n")
    const verifyFull = vi.fn(verifyRuntimeManifestAsync)
    await expect(verifyBundledAxCodeIntegrityAsync({ ...config, verifyFull })).rejects.toThrow(
      "Runtime manifest mismatch: package.json",
    )
    expect(verifyFull).toHaveBeenCalledTimes(1)
    expect(fs.existsSync(config.receiptFile)).toBe(false)
  })

  test("rejects tampered sidecar code before launch even with a matching receipt", async () => {
    const paths = makePackagedRuntime()
    const config = cachedOptions(paths)
    await verifyBundledAxCodeIntegrityAsync(config)
    fs.appendFileSync(path.join(paths.runtimeRoot, "lib", "index-node-tui.js"), "tampered\n")
    let launched = false
    await expect(verifyBundledAxCodeIntegrityAsync(config).then(() => { launched = true }))
      .rejects.toThrow("Runtime manifest mismatch: lib/index-node-tui.js")
    expect(launched).toBe(false)
    expect(fs.existsSync(config.receiptFile)).toBe(false)
  })

  test("receipt write failures do not reject a valid runtime on either a miss or a hit", async () => {
    const paths = makePackagedRuntime()
    const config = cachedOptions(paths)
    const realRename = fs.promises.rename.bind(fs.promises)
    const rename = vi.spyOn(fs.promises, "rename").mockRejectedValue(new Error("disk full"))
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      await expect(verifyBundledAxCodeIntegrityAsync(config)).resolves.toMatchObject({ status: "verified", cache: "miss" })
      rename.mockImplementation(realRename)
      await verifyBundledAxCodeIntegrityAsync(config)
      rename.mockRejectedValue(new Error("permission denied"))
      await expect(verifyBundledAxCodeIntegrityAsync(config)).resolves.toMatchObject({ status: "verified", cache: "hit" })
      expect(warning).toHaveBeenCalledTimes(2)
    } finally {
      rename.mockRestore()
      warning.mockRestore()
    }
  })

  test("receipt cleanup failure cannot hide the original integrity error", async () => {
    const paths = makePackagedRuntime()
    const config = cachedOptions(paths)
    await verifyBundledAxCodeIntegrityAsync(config)
    fs.appendFileSync(path.join(paths.runtimeRoot, "lib", "index-node-tui.js"), "tampered\n")
    const remove = vi.spyOn(fs.promises, "rm").mockRejectedValue(new Error("receipt locked"))
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      await expect(verifyBundledAxCodeIntegrityAsync(config)).rejects.toThrow(
        "Runtime manifest mismatch: lib/index-node-tui.js",
      )
    } finally {
      remove.mockRestore()
      warning.mockRestore()
    }
  })

  test("fully verifies again when the app version changes", async () => {
    const paths = makePackagedRuntime()
    const config = cachedOptions(paths)
    await verifyBundledAxCodeIntegrityAsync(config)
    const verifyFull = vi.fn(verifyRuntimeManifestAsync)
    await expect(verifyBundledAxCodeIntegrityAsync({ ...config, appVersion: "2.0.0", verifyFull }))
      .resolves.toMatchObject({ cache: "miss" })
    expect(verifyFull).toHaveBeenCalledTimes(1)
    expect(JSON.parse(fs.readFileSync(config.receiptFile, "utf8")).appVersion).toBe("2.0.0")
  })

  test("fully verifies changed manifest digests and runtime realpaths", async () => {
    const paths = makePackagedRuntime()
    const config = cachedOptions(paths)
    await verifyBundledAxCodeIntegrityAsync(config)
    const manifestFile = path.join(paths.appPath, "dist", EMBEDDED_MANIFEST_NAME)
    const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"))
    manifest.files.reverse()
    fs.writeFileSync(manifestFile, JSON.stringify(manifest))
    await expect(verifyBundledAxCodeIntegrityAsync(config)).resolves.toMatchObject({ cache: "miss" })
    const movedResources = `${paths.resourcesPath}-moved`
    fs.renameSync(paths.resourcesPath, movedResources)
    await expect(verifyBundledAxCodeIntegrityAsync({
      ...config, resourcesPath: movedResources, receiptFile: path.join(movedResources, "receipts", "integrity.json"),
    })).resolves.toMatchObject({ cache: "miss" })
  })

  test("uses canonical manifest JSON regardless of object key order", async () => {
    const paths = makePackagedRuntime()
    const config = cachedOptions(paths)
    await verifyBundledAxCodeIntegrityAsync(config)
    const manifestFile = path.join(paths.appPath, "dist", EMBEDDED_MANIFEST_NAME)
    const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"))
    fs.writeFileSync(manifestFile, JSON.stringify({ files: manifest.files, algorithm: manifest.algorithm, schema: manifest.schema }))
    const hit = await verifyBundledAxCodeIntegrityAsync(config)
    expect(hit.cache).toBe("hit")
  })

  test("never writes a receipt for a failed full scan", async () => {
    const paths = makePackagedRuntime()
    const config = cachedOptions(paths)
    fs.appendFileSync(path.join(paths.runtimeRoot, "lib", "index-node-tui.js"), "tampered\n")
    await expect(verifyBundledAxCodeIntegrityAsync(config)).rejects.toThrow("Runtime manifest mismatch")
    expect(fs.existsSync(config.receiptFile)).toBe(false)
  })

  test("verifies the external runtime against the ASAR-trusted manifest", async () => {
    const paths = makePackagedRuntime()
    await expect(verifyBundledAxCodeIntegrityAsync(options(paths))).resolves.toMatchObject({
      status: "verified",
      entries: 3,
    })
  })

  test("rejects modified sidecar JavaScript", async () => {
    const paths = makePackagedRuntime()
    fs.appendFileSync(path.join(paths.runtimeRoot, "lib", "index-node-tui.js"), "modified\n")
    await expect(verifyBundledAxCodeIntegrityAsync(options(paths))).rejects.toThrow(
      "Runtime manifest mismatch: lib/index-node-tui.js",
    )
  })

  test("rejects a file added to the runtime tree", async () => {
    const paths = makePackagedRuntime()
    fs.writeFileSync(path.join(paths.runtimeRoot, "lib", "extra.js"), "evil\n")
    await expect(verifyBundledAxCodeIntegrityAsync(options(paths))).rejects.toThrow(
      "Runtime file is not listed in manifest: lib/extra.js",
    )
  })

  test("fails closed when a required packaged runtime is removed", async () => {
    const paths = makePackagedRuntime()
    fs.rmSync(path.join(paths.runtimeRoot, "bin", "ax-code"))
    await expect(verifyBundledAxCodeIntegrityAsync(options(paths))).rejects.toThrow(
      "required by the trusted ASAR manifest is incomplete",
    )
  })

  test("skips a placeholder build and rejects a runtime inserted into one", async () => {
    const paths = makePackagedRuntime({ staged: false })
    await expect(verifyBundledAxCodeIntegrityAsync(options(paths))).resolves.toMatchObject({
      status: "skipped",
      reason: "runtime-not-staged",
    })
    fs.mkdirSync(path.join(paths.runtimeRoot, "bin"), { recursive: true })
    fs.writeFileSync(path.join(paths.runtimeRoot, "bin", "ax-code"), "#!/bin/sh\n")
    await expect(verifyBundledAxCodeIntegrityAsync(options(paths))).rejects.toThrow(
      "trusted ASAR manifest authorizes only a placeholder",
    )
  })

  test("produces exactly the synchronous manifest, including symlinks and native-binary omission", async () => {
    const paths = makePackagedRuntime()
    fs.symlinkSync("package.json", path.join(paths.runtimeRoot, "link.json"))
    // Mach-O 64-bit magic without a native extension must be omitted, like the sync path.
    fs.writeFileSync(path.join(paths.runtimeRoot, "bin", "helper"), Buffer.from("cffaedfe0000", "hex"))
    fs.writeFileSync(path.join(paths.runtimeRoot, "lib", "tool.node"), "native-by-extension")
    const sync = createRuntimeManifest(paths.runtimeRoot)
    const asyncManifest = await createRuntimeManifestAsync(paths.runtimeRoot)
    expect(asyncManifest).toEqual(sync)
    expect(asyncManifest.files.map((file) => file.path)).not.toContain("bin/helper")
    expect(asyncManifest.files.map((file) => file.path)).not.toContain("lib/tool.node")
    expect(asyncManifest.files.find((file) => file.path === "link.json")).toMatchObject({ type: "symlink" })
  })

  test("rejects an external symlink like the synchronous walk", async () => {
    const paths = makePackagedRuntime()
    fs.symlinkSync("/etc/hosts", path.join(paths.runtimeRoot, "escape"))
    await expect(createRuntimeManifestAsync(paths.runtimeRoot)).rejects.toThrow("external symlink: escape")
    expect(() => createRuntimeManifest(paths.runtimeRoot)).toThrow("external symlink: escape")
  })
})
