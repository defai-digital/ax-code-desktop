import assert from "node:assert/strict"
import { spawn, execFile } from "node:child_process"
import { promisify } from "node:util"
import { randomBytes } from "node:crypto"
import { mkdtemp, mkdir, rm } from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { startRustEventStream } from "./native-client.mjs"
import { decodeNativeBatch } from "./batch-protocol.mjs"

const binary = process.argv[2] ?? "ax-code"
const { stdout } = await promisify(execFile)(binary, ["--version"], { timeout: 5000 })
const runtimeVersion = stdout.trim()
const temporary = await mkdtemp(path.join(os.tmpdir(), "ax-rust-runtime-probe-"))
const workspace = path.join(temporary, "workspace")
await mkdir(workspace)
const password = randomBytes(24).toString("base64")
// Isolate runtime state and do not inherit provider credentials or activate any model.
const env = {
  PATH: process.env.PATH,
  HOME: process.env.HOME,
  LANG: "en_US.UTF-8",
  TMPDIR: process.env.TMPDIR,
  AX_CODE_TEST_HOME: path.join(temporary, "profile"),
  AX_CODE_PROJECT: workspace,
  AX_CODE_SERVER_PASSWORD: password,
  AX_CODE_DISABLE_AUTOUPDATE: "1",
  AX_CODE_DISABLE_LSP_DOWNLOAD: "1",
  AX_CODE_DISABLE_EXTERNAL_SKILLS: "1",
}
const runtime = spawn(binary, ["serve", "--hostname=127.0.0.1", "--port=0"], {
  cwd: workspace,
  env,
  stdio: ["ignore", "pipe", "pipe"],
})
const exited = new Promise((resolve) => runtime.once("close", resolve))
runtime.stderr.resume()
let client
try {
  const endpoint = await new Promise((resolve, reject) => {
    let buffer = ""
    const timer = setTimeout(() => reject(new Error("Runtime readiness timed out")), 10000)
    runtime.once("error", () => {
      clearTimeout(timer)
      reject(new Error("Runtime could not start"))
    })
    runtime.once("exit", () => {
      clearTimeout(timer)
      reject(new Error("Runtime exited before readiness"))
    })
    runtime.stdout.on("data", (chunk) => {
      buffer = (buffer + chunk.toString()).slice(-4096)
      const match = buffer.match(/ax-code server listening on (http:\/\/127\.0\.0\.1:\d+)/)
      if (match) {
        clearTimeout(timer)
        resolve(match[1] + "/global/event")
      }
    })
  })
  const denied = startRustEventStream({ endpoint })
  await assert.rejects(async () => {
    for await (const _batch of denied.batches) {
    }
  }, /Native event stream failed/)
  client = startRustEventStream({
    endpoint,
    authorization: "Basic " + Buffer.from("ax-code:" + password).toString("base64"),
  })
  let timer
  const first = await Promise.race([
    client.batches.next(),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("Runtime event acknowledgement timed out")), 10000)
    }),
  ]).finally(() => clearTimeout(timer))
  assert.equal(decodeNativeBatch(first.value).frames[0].type, "ready")
  await client.close()
  await client.batches.return()
  console.log(
    JSON.stringify({
      passed: true,
      runtimeVersion,
      transport: "authenticated-direct-Rust-SSE",
      deniedWithoutCredentials: true,
      modelRequests: 0,
      scope: "Installed runtime handshake only; not Desktop pinned-runtime release qualification",
    }),
  )
} finally {
  if (client) await client.close()
  runtime.kill()
  let timer
  await Promise.race([
    exited,
    new Promise((resolve) => {
      timer = setTimeout(resolve, 2000)
    }),
  ])
  clearTimeout(timer)
  if (runtime.exitCode === null && runtime.signalCode === null) {
    runtime.kill("SIGKILL")
    await exited
  }
  await rm(temporary, { recursive: true, force: true })
}
