import assert from "node:assert/strict"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const report = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(report, "../../..")
const receipt = JSON.parse(await fs.readFile(path.join(report, "verification.json"), "utf8"))
const binaryDirectory = path.join(receipt.runtimeDownloadDirectory, "darwin-smoke/bin")
const fixture = await fs.mkdtemp(path.join(os.tmpdir(), "ax-sdk-2.6.35-smoke-"))
for (const key of Object.keys(process.env)) {
  if (key.startsWith("AX_CODE_") || key.startsWith("OPENCODE_")) delete process.env[key]
}
for (const kind of ["CONFIG", "DATA", "CACHE", "STATE"]) {
  const directory = path.join(fixture, kind.toLowerCase())
  await fs.mkdir(directory)
  process.env[`XDG_${kind}_HOME`] = directory
}
process.env.PATH = `${binaryDirectory}${path.delimiter}${process.env.PATH}`
process.chdir(fixture)
const { createAxCode } = await import(pathToFileURL(path.join(root, "desktop/packages/ui/node_modules/@defai-digital/ax-code-sdk/dist/v2/index.js")).href)
const controller = new AbortController()
const timer = setTimeout(() => controller.abort(), 30_000)
const { client, server } = await createAxCode({ port: 0, timeout: 20_000, signal: controller.signal, config: { plugin: [], mcp: {} } })
let summary
try {
  const health = await client.global.health()
  assert.equal(health.error, undefined)
  assert.equal(health.data.healthy, true)
  assert.equal(health.data.version, "7.27.4")
  const capabilities = await client.global.capabilities()
  assert.equal(capabilities.error, undefined)
  assert.ok(capabilities.data)
  const commands = await client.command.list({ directory: fixture })
  assert.equal(commands.error, undefined)
  assert.ok(Array.isArray(commands.data))
  assert.equal(commands.data.some((command) => command.name === "analysis-output"), false)
  summary = { passed: true, sdkVersion: "2.6.35", runtimeVersion: health.data.version, health: true, capabilities: true, commandCatalog: true, analysisSkillInPublishedRuntime: false, fixture, platform: process.platform, arch: process.arch, scope: "Downloaded signed native runtime with the actual installed JSR SDK; isolated loopback server, no model request or user installation." }
} finally {
  await server.close()
  clearTimeout(timer)
}
await fs.writeFile(path.join(report, "native-sdk-smoke.json"), JSON.stringify(summary, null, 2) + "\n")
console.log(JSON.stringify(summary))
