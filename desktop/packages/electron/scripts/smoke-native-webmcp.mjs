#!/usr/bin/env node
import { spawn } from "node:child_process"
import { createRequire } from "node:module"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

const require = createRequire(import.meta.url)
const args = process.argv.slice(2).filter((arg) => arg !== "--")
const value = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined)
const electron = value("--electron") || require("electron")
const outputDir = path.resolve(
  value("--output-dir") || (await mkdtemp(path.join(os.tmpdir(), "ax-coder-native-webmcp-"))),
)
await mkdir(outputDir, { recursive: true })
const records = []
for (const [name, enabled] of [
  ["disabled", false],
  ["enabled", true],
  ["enabled-repeat", true],
]) {
  const output = path.join(outputDir, `${name}.json`)
  // A child must produce this run's evidence; never accept a retained success.
  await rm(output, { force: true })
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  delete env.NODE_OPTIONS
  const child = spawn(
    electron,
    [
      path.join(import.meta.dirname, "probe-native-webmcp.cjs"),
      "--use-mock-keychain",
      `--probe-output=${output}`,
      ...(enabled ? ["--probe-enable-webmcp"] : []),
    ],
    { env, stdio: ["ignore", "pipe", "pipe"] },
  )
  let log = ""
  for (const stream of [child.stdout, child.stderr])
    stream.on("data", (data) => {
      log += data
    })
  const timer = setTimeout(() => child.kill("SIGKILL"), 45000)
  const status = await new Promise((resolve, reject) => {
    child.once("error", reject)
    child.once("exit", (code) => resolve(code))
  }).finally(() => clearTimeout(timer))
  await writeFile(path.join(outputDir, `${name}.log`), log)
  if (status !== 0) throw new Error(`Native WebMCP ${name} failed; see ${outputDir}`)
  const record = JSON.parse(await readFile(output, "utf8"))
  if (!record.passed || record.featureEnabled !== enabled || record.productionQualified !== false) {
    throw new Error(`Invalid native qualification record: ${output}`)
  }
  records.push(record)
  console.log(`Electron ${record.electron} / Chromium ${record.chromium}: ${name} passed`)
}
await writeFile(
  path.join(outputDir, "summary.json"),
  JSON.stringify({ schema: "ax-coder.native-webmcp-comparison.v1", records }, null, 2) + "\n",
)
console.log(`Native qualification evidence: ${outputDir}`)
