import { afterEach, describe, expect, it } from "vitest"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { verifyLaunchAnimationAssets } from "../../../scripts/check-launch-animations.mjs"

const assets = fileURLToPath(new URL("../resources/launch-animations/", import.meta.url))
const temps = []
afterEach(async () => {
  await Promise.all(temps.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })))
})
async function fixture() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ax-code-art-integrity-"))
  temps.push(dir)
  const manifest = JSON.parse(await fs.readFile(path.join(assets, "manifest.json"), "utf8"))
  return { dir, manifest, write: () => fs.writeFile(path.join(dir, "manifest.json"), JSON.stringify(manifest)) }
}
describe("committed animation assets", () => {
  it("verifies all 36 pairs and 72 committed media hashes", async () => {
    expect(await verifyLaunchAnimationAssets(assets)).toMatchObject({ pairs: 36, clips: 72 })
  })
  it("rejects packaging when producer attribution is missing", async () => {
    const { dir } = await fixture()
    await fs.cp(assets, dir, { recursive: true })
    await fs.rm(path.join(dir, "NOTICE"))
    await expect(verifyLaunchAnimationAssets(dir)).rejects.toThrow("Missing animation attribution: NOTICE")
  })
  it("rejects a tampered clip instead of packaging altered artwork", async () => {
    const { dir, manifest, write } = await fixture()
    const clip = manifest.pairs[0].opening
    const bytes = await fs.readFile(path.join(assets, clip.file))
    bytes[bytes.length - 1] ^= 1
    await fs.writeFile(path.join(dir, clip.file), bytes)
    await write()
    await expect(verifyLaunchAnimationAssets(dir)).rejects.toThrow("Animation integrity mismatch")
  })
  it("rejects paths outside the artwork directory", async () => {
    const { dir, manifest, write } = await fixture()
    manifest.pairs[0].opening.file = "../other.webm"
    await write()
    await expect(verifyLaunchAnimationAssets(dir)).rejects.toThrow("Invalid animation filename")
  })
  it("rejects mismatched pair roles", async () => {
    const { dir, manifest, write } = await fixture()
    manifest.pairs[0].ending = manifest.pairs[0].opening
    await write()
    await fs.copyFile(path.join(assets, manifest.pairs[0].opening.file), path.join(dir, manifest.pairs[0].opening.file))
    await expect(verifyLaunchAnimationAssets(dir)).rejects.toThrow("Invalid animation filename")
  })
})
