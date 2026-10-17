"use strict"

// Read-only source investigation. Never load real OAuth state or connect to a public relay.
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")
const http = require("node:http")
const assert = require("node:assert/strict")
const crypto = require("node:crypto")
const { createRequire } = require("node:module")
const { EventEmitter } = require("node:events")

const expectedHash = "30c4ed90ed00f0e4c567a940214207e3c8ec31fe4db81d022fe68d5e518e00a9"
const workspaceRoot = path.dirname(path.resolve(__dirname, "../../../.."))
const options = {
  "--ax-code-root": path.join(workspaceRoot, "ax-code"),
  "--kimi-root": path.join(workspaceRoot, "ax-code", ".internal/reference/kimi-code"),
}
for (let index = 2; index < process.argv.length; index += 2) {
  const flag = process.argv[index]
  const value = process.argv[index + 1]
  if (!Object.hasOwn(options, flag) || !value || value.startsWith("--")) {
    throw new Error("Expected --ax-code-root PATH and/or --kimi-root PATH")
  }
  options[flag] = path.resolve(value)
}

async function run() {
  const sourcePath = path.join(options["--kimi-root"], "packages/remote-control/src/remote-control.ts")
  const original = fs.readFileSync(sourcePath, "utf8")
  const sourceHash = crypto.createHash("sha256").update(original).digest("hex")
  assert.equal(sourceHash, expectedHash, "Reference source changed; review the probe before updating its pin")
  const taskRequire = createRequire(path.join(options["--ax-code-root"], "package.json"))
  const ts = taskRequire("typescript")
  const source = original + "\nexport { requestLocalHttp, relayWebSocketUrl, bridgeSockets };\n"
  const compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText
  const sourceModule = { exports: {} }
  vm.runInNewContext(
    compiled,
    {
      module: sourceModule,
      exports: sourceModule.exports,
      require(name) {
        if (name === "@moonshot-ai/kimi-code-oauth" || name === "./lock") return {}
        if (name === "ws") return { WebSocket: { OPEN: 1 } }
        if (!name.startsWith("node:")) throw new Error("Unexpected dependency in read-only probe")
        return require(name)
      },
      Buffer,
      URL,
      process: { env: Object.create(null) },
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      AbortController,
    },
    { filename: sourcePath },
  )
  const api = sourceModule.exports
  const observations = []

  const relayUrl = api.relayWebSocketUrl("http://relay.example.invalid", "/v1/remote/create")
  assert.equal(relayUrl, "ws://relay.example.invalid/v1/remote/create")
  observations.push({
    id: "RC01",
    behavior: "Non-loopback HTTP relay override becomes plaintext WebSocket",
    observed_url: relayUrl,
    qualification: "The production default is HTTPS; this tests custom-configuration hardening only.",
  })

  let activeResponse
  let signalFirstChunk
  const firstChunkWritten = new Promise((resolve) => {
    signalFirstChunk = resolve
  })
  const server = http.createServer((_request, response) => {
    activeResponse = response
    response.writeHead(200, { "Content-Type": "text/event-stream" })
    response.write("data: progress\n\n")
    signalFirstChunk()
  })
  await new Promise((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", resolve)
  })
  let completed = false
  const controller = new AbortController()
  const deadline = setTimeout(() => controller.abort(), 5000)
  try {
    const pending = api
      .requestLocalHttp(
        `http://127.0.0.1:${server.address().port}`,
        { method: "GET", path: "/events", headers: [], body: [] },
        "synthetic-local-token",
        "/devices/test",
        controller.signal,
        () => true,
      )
      .then((result) => {
        completed = true
        return result
      })
    // Observe any rejection while waiting for the local server, avoiding an unhandled rejection.
    const pendingError = pending.then(
      () => undefined,
      (error) => Promise.reject(error),
    )
    await Promise.race([firstChunkWritten, pendingError])
    await new Promise((resolve) => setTimeout(resolve, 150))
    assert.equal(completed, false)
    activeResponse.end("data: completed\n\n")
    const response = Buffer.concat(await pending).toString("utf8")
    await pendingError
    assert.match(response, /data: progress/)
    assert.match(response, /data: completed/)
    observations.push({
      id: "RC02",
      behavior: "HTTP forwarding buffers SSE until response end",
      initial_event_delivered_before_end: false,
      qualification: "Kimi uses a separate application WebSocket transport; this does not show its own UI is broken.",
    })
  } finally {
    clearTimeout(deadline)
    controller.abort()
    activeResponse?.end()
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
  }

  let executions = 0
  const responses = []
  const socket = {
    readyState: 1,
    send(data, callback) {
      responses.push(data)
      callback()
    },
    terminate() {},
  }
  const tunnel = new api.HttpTunnel(
    socket,
    async () => {
      executions += 1
      return [Buffer.from("HTTP/1.1 200 OK\r\nContent-Length: 0\r\n\r\n")]
    },
    { write() {} },
  )
  const wire = Buffer.from(
    JSON.stringify({
      type: "request",
      request_id: "same-completed-id",
      is_last: true,
      body_base64: Buffer.from("POST /synthetic-operation HTTP/1.1\r\nContent-Length: 0\r\n\r\n").toString("base64"),
    }),
  )
  try {
    tunnel.handleMessage(wire)
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(responses.length, 1)
    tunnel.handleMessage(wire)
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(executions, 2)
    observations.push({
      id: "RC03",
      behavior: "Repeating a completed HTTP request ID forwards again",
      forwards: executions,
      qualification: "Application-level prompt deduplication is outside this isolated transport test.",
    })
  } finally {
    tunnel.close()
  }

  class FakeSocket extends EventEmitter {
    readyState = 1
    bufferedAmount = 100 * 1024 * 1024
    sent = 0
    paused = 0
    send() {
      this.sent += 1
    }
    close() {
      this.readyState = 3
    }
    pause() {
      this.paused += 1
    }
  }
  const left = new FakeSocket()
  const right = new FakeSocket()
  api.bridgeSockets(left, right, () => {})
  for (let index = 0; index < 100; index += 1) {
    left.emit("message", Buffer.from("synthetic-frame"), false)
  }
  assert.equal(right.sent, 100)
  assert.equal(left.paused, 0)
  observations.push({
    id: "RC04",
    behavior: "Bridge forwards despite a simulated large queued-byte count",
    forwarded_frames: right.sent,
    pause_calls: left.paused,
    qualification:
      "The local Kimi application server has separate backpressure checks; this tests the additional bridge.",
  })
  left.close()
  right.close()
  left.removeAllListeners()
  right.removeAllListeners()

  assert.equal(crypto.createHash("sha256").update(fs.readFileSync(sourcePath)).digest("hex"), sourceHash)
  return {
    schema_version: 1,
    captured_at: new Date().toISOString(),
    evidence_level: "L1 isolated local behavior",
    status: "all four observations reproduced",
    source_path: sourcePath,
    source_sha256: sourceHash,
    harness_sha256: crypto.createHash("sha256").update(fs.readFileSync(__filename)).digest("hex"),
    node_version: process.version,
    typescript_version: ts.version,
    public_network_requests: 0,
    loopback_http_servers: 1,
    reference_source_modified: false,
    upstream_package_tests_run: false,
    limitations: [
      "Unused OAuth and lock dependencies are stubbed; no real credentials are read.",
      "The WebSocket constructor is stubbed; no public or real relay connection is opened.",
      "The observations do not establish cloud behavior, an authentication bypass, or product-wide test success.",
    ],
    observations,
  }
}

run().then(
  (result) => process.stdout.write(JSON.stringify(result, null, 2) + "\n"),
  (error) => {
    process.stderr.write(`Probe failed: ${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  },
)
