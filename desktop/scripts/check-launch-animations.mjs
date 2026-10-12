#!/usr/bin/env node
import { createHash } from "node:crypto"
import { constants as fsConstants } from "node:fs"
import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const defaultDir = fileURLToPath(new URL("../packages/electron/resources/launch-animations/", import.meta.url))
export async function verifyLaunchAnimationAssets(dir = defaultDir) {
  const manifest = JSON.parse(await fs.readFile(path.join(dir, "manifest.json"), "utf8"))
  if (
    manifest.schema !== "ax-coder.launch-animations.v1" ||
    manifest.pairs?.length !== 36 ||
    manifest.codec !== "vp9" ||
    manifest.durationMs !== 3000 ||
    manifest.fps !== 24 ||
    manifest.width !== 960 ||
    manifest.height !== 540 ||
    !/^[a-f0-9]{40}$/.test(manifest.producer?.commit) ||
    manifest.producer?.license !== "Apache-2.0"
  ) {
    throw new Error("Invalid launch animation manifest")
  }
  const files = new Set(),
    ids = new Set()
  let totalBytes = 0
  for (const pair of manifest.pairs) {
    if (!/^[0-9]{2}$/.test(pair.id) || ids.has(pair.id)) throw new Error("Invalid or duplicate animation pair")
    ids.add(pair.id)
    for (const kind of ["opening", "ending"]) {
      const clip = pair[kind]
      if (
        !/^[a-z0-9-]+\.webm$/.test(clip?.file) ||
        clip.file !== `${pair.id}-${kind}-${clip.style}.webm` ||
        files.has(clip.file)
      ) {
        throw new Error("Invalid animation filename")
      }
      files.add(clip.file)
      const filename = path.join(dir, clip.file)
      const openFlags = fsConstants.O_RDONLY | (typeof fsConstants.O_NOFOLLOW === "number" ? fsConstants.O_NOFOLLOW : 0)
      let handle
      try {
        handle = await fs.open(filename, openFlags)
      } catch (error) {
        if (error && typeof error === "object" && error.code === "ELOOP") {
          throw new Error(`Invalid animation size: ${clip.file}`)
        }
        throw error
      }
      try {
        const stat = await handle.stat()
        if (!stat.isFile() || stat.size > 3 * 1024 * 1024 || stat.size !== clip.bytes) {
          throw new Error(`Invalid animation size: ${clip.file}`)
        }
        const bytes = await handle.readFile()
        if (
          bytes.subarray(0, 4).toString("hex") !== "1a45dfa3" ||
          createHash("sha256").update(bytes).digest("hex") !== clip.sha256
        ) {
          throw new Error(`Animation integrity mismatch: ${clip.file}`)
        }
        totalBytes += bytes.length
      } finally {
        await handle.close()
      }
    }
  }
  for (const file of ["LICENSE", "LICENSE-MIT", "NOTICE"]) {
    const stat = await fs.lstat(path.join(dir, file)).catch(() => null)
    if (!stat?.isFile() || stat.size === 0) throw new Error(`Missing animation attribution: ${file}`)
  }
  return { pairs: ids.size, clips: files.size, bytes: totalBytes, commit: manifest.producer.commit }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log("Launch animation assets verified:", await verifyLaunchAnimationAssets())
}
