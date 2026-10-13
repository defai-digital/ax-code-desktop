import assert from "node:assert/strict"
import { test } from "node:test"
import { createServer } from "node:http"
import { spawn } from "node:child_process"
import { DEFAULT_BINARY, startRustEventStream } from "./native-client.mjs"
import { decodeNativeBatch } from "./batch-protocol.mjs"
import { NativeBatchWindow } from "./batch-window.mjs"
import { createJsEventStream } from "./js-client.mjs"
import { parseSseEventEnvelope } from "../../../desktop/packages/web/server/lib/event-stream/protocol.js"

const wire = (id, payload, directory = "/fixture") =>
  `id: ${id}\r\ndata: ${JSON.stringify({ directory, payload })}\r\n\r\n`
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
async function serverFixture(t, listener) {
  const server = createServer(listener)
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
  t.after(async () => {
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
  })
  return `http://127.0.0.1:${server.address().port}/global/event`
}
async function collect(handle) {
  const batches = []
  for await (const line of handle.batches) batches.push(decodeNativeBatch(line))
  return batches
}

test("native framing matches the current JS parser for canonical and legacy envelopes", async () => {
  const blocks = [
    ': comment\ndata: {"type":"server.connected","properties":{}}',
    'id: first\nid: second\ndata: {"directory":"/fixture","payload":{"type":"message.part.delta","properties":{"delta":"\u{1f642}\u{00e9}\\ntext"}}}',
    'id: legacy\ndata: {\ndata: "type":"custom.future",\ndata: "properties":{"directory":"/legacy","extra":[1,true,null]}}',
    "id: ignored\ndata: not-json",
    'id: wrapped\ndata: {"directory":"","payload":{"type":"session.updated"}}',
    "id: no-payload\nevent: ignored",
    'id: final\ndata: {"type":"session.updated"}',
  ]
  const source =
    blocks
      .slice(0, -1)
      .join("\r\n\r\n")
      .replace(/(?<!\r)\n/g, "\r\n") +
    "\r\n\r\n" +
    blocks.at(-1)
  const child = spawn(DEFAULT_BINARY, ["--decode-fixture"], { stdio: ["pipe", "pipe", "pipe"] })
  let output = "",
    errors = ""
  child.stdout.on("data", (chunk) => {
    output += chunk
  })
  child.stderr.on("data", (chunk) => {
    errors += chunk
  })
  child.stdin.end(source)
  const code = await new Promise((resolve) => child.on("close", resolve))
  assert.equal(code, 0, errors)
  const expected = source.replace(/\r\n/g, "\n").split("\n\n").map(parseSseEventEnvelope).filter(Boolean)
  assert.deepEqual(JSON.parse(output), expected)
})

test("direct SSE client preserves order, unknown events, gap events and complete Unicode across bounded batches", async (t) => {
  const expected = Array.from({ length: 1100 }, (_, index) => ({
    type: index === 149 ? "server.resync_required" : "message.part.delta",
    properties: { index, delta: "\u{1f642}" },
  }))
  let requestHeaders
  const endpoint = await serverFixture(t, (req, res) => {
    requestHeaders = req.headers
    res.writeHead(200, { "content-type": "text/event-stream" })
    res.write(wire("c0", { type: "server.connected" }))
    for (const [index, payload] of expected.entries()) res.write(wire(`c${index + 1}`, payload))
    res.end(wire("c1101", { type: "server.heartbeat" }))
  })
  const handle = startRustEventStream({ endpoint, authorization: "Basic fixture-only", lastEventId: "before" })
  t.after(handle.close)
  const batches = await collect(handle)
  assert.equal(requestHeaders.authorization, "Basic fixture-only")
  assert.equal(requestHeaders["last-event-id"], "before")
  assert.ok(batches.every((batch) => batch.frames.length <= 512))
  const frames = batches.flatMap((batch) => batch.frames)
  assert.equal(frames[0].type, "ready")
  assert.deepEqual(
    frames.filter((frame) => frame.type === "event").map((frame) => frame.payload),
    expected,
  )
  assert.equal(batches.at(-1).cursor, "c1101")
  assert.ok(!JSON.stringify(batches).includes("Basic fixture-only"))
})

test("small pending batches flush before upstream EOF and cancellation stops the child", async (t) => {
  const endpoint = await serverFixture(t, (_req, res) => {
    res.writeHead(200, { "content-type": "text/event-stream" })
    res.write(wire("c1", { type: "server.connected" }))
  })
  const controller = new AbortController()
  const handle = startRustEventStream({ endpoint, signal: controller.signal })
  t.after(handle.close)
  const first = await handle.batches.next()
  assert.equal(decodeNativeBatch(first.value).frames[0].type, "ready")
  controller.abort()
  await handle.completion
  assert.equal((await handle.batches.next()).done, true)
})

test("a restart resumes only from a consumer-acknowledged cursor", async (t) => {
  const headers = []
  const endpoint = await serverFixture(t, (req, res) => {
    headers.push(req.headers["last-event-id"])
    res.writeHead(200, { "content-type": "text/event-stream" })
    res.end(wire("c1", { type: "server.connected" }) + wire("c2", { type: "custom.future" }))
  })
  const first = await collect(startRustEventStream({ endpoint }))
  const acknowledgedCursor = first.at(-1).cursor
  await collect(startRustEventStream({ endpoint, lastEventId: acknowledgedCursor }))
  assert.deepEqual(headers, [undefined, "c2"])
})

test("redirects and non-SSE responses fail without forwarding credentials to a target", async (t) => {
  let redirectedRequests = 0
  const target = await serverFixture(t, (_req, res) => {
    redirectedRequests++
    res.end("unreachable")
  })
  const redirect = await serverFixture(t, (_req, res) => {
    res.writeHead(302, { location: target })
    res.end()
  })
  await assert.rejects(
    collect(startRustEventStream({ endpoint: redirect, authorization: "Basic fixture-only" })),
    /Native event stream failed/,
  )
  assert.equal(redirectedRequests, 0)
  const html = await serverFixture(t, (_req, res) => {
    res.writeHead(200, { "content-type": "text/html" })
    res.end("not SSE")
  })
  await assert.rejects(collect(startRustEventStream({ endpoint: html })), /Native event stream failed/)
})

test("an oversized or unsupported frame fails explicitly instead of acknowledging skipped data", async (t) => {
  for (const body of ["data: " + "x".repeat(1024 * 1024 + 1), 'id: c1\ndata: {"text":"\\ud800"}\n\n']) {
    const endpoint = await serverFixture(t, (_req, res) => {
      res.writeHead(200, { "content-type": "text/event-stream" })
      res.end(body)
    })
    await assert.rejects(collect(startRustEventStream({ endpoint })), /Native event stream failed/)
  }
})

test("abort before start and invalid batch protocol do not permit delivery", () => {
  const controller = new AbortController()
  controller.abort()
  assert.throws(
    () => startRustEventStream({ endpoint: "http://127.0.0.1/global/event", signal: controller.signal }),
    /cancelled/,
  )
  for (const batch of [
    "{}",
    '{"schema":1,"cursor":"","frames":[{"type":"unknown"}]}',
    '{"schema":1,"cursor":"","frames":[{"type":"event","payload":null,"directory":"global"}]}',
  ]) {
    assert.throws(() => decodeNativeBatch(batch))
  }
})

test("ending consumer iteration shuts down a live child without hidden retries", async (t) => {
  let requests = 0
  const endpoint = await serverFixture(t, (_req, res) => {
    requests++
    res.writeHead(200, { "content-type": "text/event-stream" })
    res.write(wire("c1", { type: "server.connected" }))
  })
  const handle = startRustEventStream({ endpoint })
  t.after(handle.close)
  for await (const line of handle.batches) {
    assert.equal(decodeNativeBatch(line).frames[0].type, "ready")
    break
  }
  await handle.completion
  await pause(20)
  assert.equal(requests, 1)
})

test("byte backpressure and out-of-order ACKs preserve a contiguous recovery cursor", async () => {
  const window = new NativeBatchWindow()
  const delivered = []
  const send = (cursor, bytes = 2 * 1024 * 1024) =>
    window.send({ cursor }, bytes, (sequence) => delivered.push(sequence))
  await send("c1")
  await send("c2")
  const third = send("c3")
  assert.equal(window.pendingBytes, 4 * 1024 * 1024)
  assert.equal(window.acknowledge(2, "wrong"), false)
  assert.equal(window.acknowledge(2, "c2"), true)
  await pause(5)
  assert.deepEqual(delivered, [1, 2])
  assert.equal(window.cursor, "")
  window.acknowledge(1, "c1")
  await third
  assert.equal(window.cursor, "c2")
  assert.equal(window.pendingCount, 1)
  assert.equal(window.pendingBytes, 2 * 1024 * 1024)
  window.acknowledge(3, "c3")
  assert.equal(window.cursor, "c3")
  assert.equal(window.pendingBytes, 0)
})

test("the batch count stays bounded and shutdown releases a blocked sender", async () => {
  const window = new NativeBatchWindow()
  for (let index = 1; index <= 8; index++) await window.send({ cursor: `c${index}` }, 10, () => {})
  const waiting = window.send({ cursor: "c9" }, 10, () => {})
  const rejected = assert.rejects(waiting, /closed/)
  assert.equal(window.pendingCount, 8)
  window.close()
  await rejected
  assert.equal(window.pendingCount, 0)
  assert.equal(window.pendingBytes, 0)
  assert.equal(window.cursor, "")
})

test("the direct JS IPC control preserves the same frames and cursor as Rust", async (t) => {
  const body =
    wire("c1", { type: "server.connected" }) +
    wire("c2", { type: "custom.future", properties: { value: "\u{1f642}" } }) +
    wire("c3", { type: "server.heartbeat" })
  const endpoint = await serverFixture(t, (_req, res) => {
    res.writeHead(200, { "content-type": "text/event-stream" })
    res.end(body)
  })
  const rust = await collect(startRustEventStream({ endpoint }))
  const js = []
  for await (const { batch } of createJsEventStream({ endpoint })) js.push(batch)
  assert.deepEqual(
    js.flatMap((batch) => batch.frames),
    rust.flatMap((batch) => batch.frames),
  )
  assert.equal(js.at(-1).cursor, rust.at(-1).cursor)
})
