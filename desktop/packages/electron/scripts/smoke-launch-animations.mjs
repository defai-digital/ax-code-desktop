#!/usr/bin/env node
import { execFile } from "node:child_process"
import { createRequire } from "node:module"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

const run = promisify(execFile)
const require = createRequire(import.meta.url)
const directory = path.dirname(fileURLToPath(import.meta.url))
const temp = await fs.mkdtemp(path.join(os.tmpdir(), "ax-code-animation-smoke-"))
try {
  const output = path.join(temp, "result.json")
  const evidence = process.env.AX_ANIMATION_SMOKE_EVIDENCE
  if (evidence) await fs.mkdir(evidence, { recursive: true })
  let entry = path.join(directory, "smoke-launch-animations-entry.cjs")
  const asar = process.argv.includes("--asar")
  if (asar) {
    const root = path.join(temp, "package")
    for (const dir of ["scripts", "src", "resources/launch-animations", "dist"])
      await fs.mkdir(path.join(root, dir), { recursive: true })
    await fs.copyFile(entry, path.join(root, "scripts/smoke-launch-animations-entry.cjs"))
    await fs.copyFile(
      path.join(directory, "../src/launch-animation-controller.js"),
      path.join(root, "src/launch-animation-controller.js"),
    )
    await fs.copyFile(
      path.join(directory, "../resources/launch-animations/manifest.json"),
      path.join(root, "resources/launch-animations/manifest.json"),
    )
    await fs.copyFile(
      path.join(directory, "../dist/launch-animation-preload.js"),
      path.join(root, "dist/launch-animation-preload.js"),
    )
    await fs.cp(path.join(directory, "../dist/launch-animations"), path.join(root, "dist/launch-animations"), {
      recursive: true,
    })
    await fs.writeFile(
      path.join(root, "package.json"),
      JSON.stringify({
        name: "ax-code-animation-smoke",
        version: "0.0.0",
        main: "scripts/smoke-launch-animations-entry.cjs",
      }),
    )
    entry = path.join(temp, "AX Code.app", "Contents", "Resources", "app.asar")
    await fs.mkdir(path.dirname(entry), { recursive: true })
    await require("@electron/asar").createPackage(root, entry)
  }
  const binaryIndex = process.argv.indexOf("--electron-binary")
  const binary = binaryIndex === -1 ? require("electron") : process.argv[binaryIndex + 1]
  if (!binary) throw new Error("--electron-binary requires an executable path")
  await run(binary, [entry], {
    env: { ...process.env, AX_ANIMATION_SMOKE_OUTPUT: output, AX_ANIMATION_SMOKE_DATA_DIR: path.join(temp, "data") },
    timeout: 60000,
    maxBuffer: 1024 * 1024,
  })
  const result = JSON.parse(await fs.readFile(output, "utf8"))
  if (evidence) await fs.copyFile(output, path.join(evidence, "result.json"))
  console.log(
    `Pinned Electron launch animation playback passed (${asar ? "ASAR" : "unpackaged"}):`,
    JSON.stringify(result),
  )
} finally {
  await fs.rm(temp, { recursive: true, force: true })
}
