import fs from "node:fs/promises"
import path from "node:path"
import http from "node:http"
import { spawn, execFileSync } from "node:child_process"
import { setTimeout as delay } from "node:timers/promises"
import assert from "node:assert/strict"
import { createRequire } from "node:module"
const require = createRequire(import.meta.url)
const { conversationInstruction } = require("../../../desktop/shared/localization.mjs")
const root = path.dirname(new URL(import.meta.url).pathname)
const workspace = path.join(root, "runtime-fixture")
await fs.mkdir(workspace, { recursive: true })
execFileSync("git", ["init", "--quiet", workspace])
await fs.writeFile(path.join(workspace, "AGENTS.md"), "Preserve commands and quoted evidence. Explicit project instructions take precedence over preferences.\n")
const requests = []
const provider = http.createServer(async (req, res) => {
  let raw = ""
  for await (const part of req) raw += part
  if (req.method !== "POST") { res.writeHead(200, { "Content-Type": "application/json" }); res.end("{}"); return }
  const body = JSON.parse(raw)
  requests.push(body)
  res.writeHead(200, { "Content-Type": "text/event-stream" })
  const base = { id: "chatcmpl-fixture", object: "chat.completion.chunk", created: 1, model: "fixture" }
  res.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: { role: "assistant", content: "Fixture response." }, finish_reason: null }] })}\n\n`)
  res.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })}\n\n`)
  res.end("data: [DONE]\n\n")
})
await new Promise((resolve) => provider.listen(0, "127.0.0.1", resolve))
const port = provider.address().port
const config = {
  provider: { "locale-fixture": { npm: "@ai-sdk/openai-compatible", name: "Local fixture", options: { baseURL: `http://127.0.0.1:${port}/v1`, apiKey: "fixture-only" }, models: { fixture: { name: "fixture", limit: { context: 1000000, output: 2048 } } } } },
  model: "locale-fixture/fixture",
  compaction: { auto: false },
  command: { "locale-probe": { template: "Explain the original arguments: $ARGUMENTS", description: "Local language transport probe" } },
}
const binary = path.join(root, "runtime-7.24.4/darwin/bin/ax-code")
const child = spawn(binary, ["serve", "--hostname", "127.0.0.1", "--port", "0"], {
  cwd: workspace,
  env: { ...process.env, AX_CODE_CONFIG_CONTENT: JSON.stringify(config), AX_CODE_CONFIG_DIR: path.join(workspace, "config"), XDG_CONFIG_HOME: path.join(workspace, "config"), XDG_DATA_HOME: path.join(workspace, "data"), XDG_CACHE_HOME: path.join(workspace, "cache"), AX_CODE_DISABLE_AUTOUPDATE: "true", AX_CODE_SERVER_PASSWORD: "", AX_CODE_DISABLE_SHARE: "true" },
  stdio: ["ignore", "pipe", "pipe"],
})
let probeApi
let probeSession
let output = ""
child.stdout.on("data", (value) => { output += value })
child.stderr.on("data", (value) => { output += value })
const wait = async (check, label) => {
  const deadline = Date.now() + 45000
  while (Date.now() < deadline) { const value = await check(); if (value) return value; await delay(100) }
  throw new Error(`Timed out: ${label}`)
}
try {
  const origin = await wait(() => output.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0], "server startup")
  const api = async (pathname, body) => {
    const endpoint = new URL(origin + pathname)
    endpoint.searchParams.set("directory", workspace)
    const result = await fetch(endpoint, { method: body ? "POST" : "GET", headers: { "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) })
    if (!result.ok) throw new Error(`${pathname}: ${result.status} ${await result.text()}`)
    return result.status === 204 ? undefined : result.json()
  }
  probeApi = api
  const session = await api("/session", {})
  probeSession = session.id
  const original = "Keep {path} and git status unchanged."
  await api(`/session/${session.id}/prompt_async`, { model: { providerID: "locale-fixture", modelID: "fixture" }, parts: [{ type: "text", text: original }], system: conversationInstruction("zh-TW") })
  const promptRequest = await wait(() => requests.find((request) => JSON.stringify(request.messages).includes("Explicit project instructions")), "provider prompt with project instructions")
  const first = JSON.stringify(promptRequest.messages)
  await fs.writeFile(path.join(root, "runtime-probe-messages.json"), JSON.stringify(promptRequest.messages, null, 2).replace(/[\u007f-\uffff]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`))
  assert(first.includes("Traditional Chinese"))
  assert(first.includes(original))
  assert(first.includes("Explicit project instructions"), "project instructions absent from provider request")
  await wait(async () => { const statuses = await api("/session/status"); return !statuses[session.id] || statuses[session.id].type === "idle" }, "prompt settled")
  await api(`/session/${session.id}/command`, { model: "locale-fixture/fixture", command: "locale-probe", arguments: "src/{file}.ts $&", system: conversationInstruction("ja") })
  const commandRequest = await wait(() => requests.find((request) => JSON.stringify(request.messages).includes("Japanese") && JSON.stringify(request.messages).includes("src/{file}.ts $&")), "provider command")
  const second = JSON.stringify(commandRequest.messages)
  assert(second.includes("Japanese"))
  assert(second.includes("src/{file}.ts $&"))
  await fs.writeFile(path.join(root, "runtime-probe-result.json"), JSON.stringify({ runtime: "7.24.4", signedArtifact: true, promptPreference: true, commandPreference: true, originalTextPreserved: true, projectInstructionsPresent: true, provider: "loopback fixture", modelLanguageQuality: "not evaluated" }, null, 2) + "\n")
  console.log("Signed runtime prompt and command language transport passed.")
} catch (error) {
  if (probeApi) await fs.writeFile(path.join(root, "runtime-probe-state.json"), JSON.stringify({ config: await probeApi("/config"), messages: await probeApi(`/session/${probeSession}/message`) }, null, 2))
  await fs.writeFile(path.join(root, "runtime-probe-all-requests.json"), JSON.stringify(requests, null, 2))
  await fs.writeFile(path.join(root, "runtime-probe-error.txt"), `${error.stack}\n${output}`)
  throw error
} finally {
  child.kill("SIGTERM")
  provider.closeAllConnections()
  provider.close()
}
