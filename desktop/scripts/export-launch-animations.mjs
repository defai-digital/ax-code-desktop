#!/usr/bin/env node
// Development-only artwork export. CI and packaged apps consume committed media,
// never AX Code source or a second runtime.
import { spawn, execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { once } from "node:events"
import fs from "node:fs/promises"
import path from "node:path"
import { pathToFileURL, fileURLToPath } from "node:url"

const sourceIndex = process.argv.indexOf("--source")
if (sourceIndex < 0 || !process.argv[sourceIndex + 1])
  throw new Error("An explicit --source AX Code checkout is required")
const source = path.resolve(process.argv[sourceIndex + 1])
const component = "packages/ax-code/src/cli/tui/component"
const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: source, encoding: "utf8" }).trim()
const assertClean = () => {
  const dirty = execFileSync("git", ["status", "--porcelain", "--", component], { cwd: source, encoding: "utf8" })
  if (dirty) throw new Error("Animation source must match a clean committed producer revision")
}
assertClean()
const load = (name) => import(pathToFileURL(path.join(source, component, `${name}.ts`)).href)
const { chooseAnimationPair } = await load("animation-pair")
const { renderTextScenePixels } = await load("text-scene-pixels")
const { isTextSceneStyle } = await load("text-scene-view-model")
const { createFoliagePixelPainter, isFoliageVariant } = await load("foliage-view-model")
const { createDigitalCodePixels, renderDigitalCodePixels } = await load("digital-code-pixels")
const { advanceDigitalCode, DIGITAL_CODE_TICK_MS } = await load("digital-code-view-model")
const output = fileURLToPath(new URL("../packages/electron/resources/launch-animations/", import.meta.url))
await fs.mkdir(output, { recursive: true })
const width = 960,
  height = 540,
  fps = 24,
  durationMs = 3000
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex")
const sourceFiles = {}
for (const name of (await fs.readdir(path.join(source, component))).sort()) {
  if (name.endsWith(".ts")) sourceFiles[name] = digest(await fs.readFile(path.join(source, component, name)))
}
const pairs = Array.from({ length: 36 }, (_, index) => chooseAnimationPair(() => (index + 0.5) / 36))
if (new Set(pairs.map((pair) => `${pair.opening}/${pair.ending}`)).size !== 36)
  throw new Error("Producer pair catalog changed")
const clips = []
for (const [index, pair] of pairs.entries()) {
  const result = { id: String(index + 1).padStart(2, "0") }
  for (const kind of ["opening", "ending"]) {
    const style = pair[kind]
    const file = `${result.id}-${kind}-${style}.webm`
    let paint
    if (isTextSceneStyle(style)) paint = (ms) => renderTextScenePixels(width, height, style, ms)
    else if (isFoliageVariant(style)) paint = createFoliagePixelPainter(width, height, style)
    else {
      let seed = index + 12345
      const random = () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
        return seed / 4294967296
      }
      const frame = createDigitalCodePixels(width, height, kind === "ending" ? "up" : "down", random)
      let tick = 0
      paint = (ms) => {
        const next = Math.floor(ms / DIGITAL_CODE_TICK_MS)
        while (tick < next) {
          frame.rain = advanceDigitalCode(frame.rain)
          tick++
        }
        return renderDigitalCodePixels({ ...frame, tick })
      }
    }
    const encoder = spawn(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-f",
        "rawvideo",
        "-pixel_format",
        "rgb24",
        "-video_size",
        `${width}x${height}`,
        "-framerate",
        String(fps),
        "-i",
        "pipe:0",
        "-an",
        "-c:v",
        "libvpx-vp9",
        "-crf",
        "33",
        "-b:v",
        "0",
        "-deadline",
        "realtime",
        "-cpu-used",
        "6",
        "-threads",
        "2",
        "-pix_fmt",
        "yuv420p",
        path.join(output, file),
      ],
      { stdio: ["pipe", "ignore", "pipe"] },
    )
    let diagnostics = ""
    encoder.stderr.on("data", (chunk) => {
      diagnostics = (diagnostics + chunk).slice(-8192)
    })
    const finished = once(encoder, "exit")
    encoder.stdin.on("error", () => {})
    try {
      for (let frame = 0; frame < (fps * durationMs) / 1000; frame++) {
        const pixels = paint((frame * 1000) / fps)
        if (pixels.length !== width * height * 3) throw new Error(`Unexpected frame size for ${style}`)
        if (!encoder.stdin.write(pixels)) await once(encoder.stdin, "drain")
      }
      encoder.stdin.end()
      const [code] = await finished
      if (code !== 0) throw new Error(`ffmpeg failed for ${file}: ${diagnostics}`)
    } catch (error) {
      encoder.kill("SIGTERM")
      throw error
    }
    const bytes = await fs.readFile(path.join(output, file))
    result[kind] = { file, style, sha256: digest(bytes), bytes: bytes.length }
    console.log(`[animation-export] ${file} (${bytes.length} bytes)`)
  }
  clips.push(result)
}
assertClean()
for (const [name, hash] of Object.entries(sourceFiles)) {
  if (digest(await fs.readFile(path.join(source, component, name))) !== hash)
    throw new Error("Producer source changed during export")
}
const manifest = {
  schema: "ax-coder.launch-animations.v1",
  producer: { repository: "defai-digital/ax-code", commit, license: "Apache-2.0", sourceFiles },
  width,
  height,
  fps,
  durationMs,
  codec: "vp9",
  pairs: clips,
}
await fs.writeFile(path.join(output, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n")
for (const file of ["LICENSE", "LICENSE-MIT", "NOTICE"]) {
  // Preserve the legal texts from the recorded producer revision, even if a
  // sibling checkout has unrelated local changes outside its scene painters.
  const bytes = execFileSync("git", ["show", `${commit}:${file}`], { cwd: source })
  await fs.writeFile(path.join(output, file), bytes)
}
console.log(`[animation-export] ${clips.length} pairs exported from ${commit}`)
