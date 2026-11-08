#!/usr/bin/env node
// Renderer trace of large-Markdown workloads in the built Electron app, the attribution
// step required before any WASM parser work (.internal/reports/WASM-2026-11-08-…).
// Each run reloads, reopens the fixture conversation and injects renderer-only events,
// so every sample is a cold document. No model call, runtime write, or user profile.
//
// Usage: node markdown-trace-webmcp.mjs [--app <path>] [--artifacts dir] [--runs n]
//        [--sizes 100000,300000] [--fence-size 200000]
// Timings are diagnostic samples on one host, not a performance SLA; they include
// queueing, Worker transfer, React commit and the next animation frame.
import fs from "node:fs/promises"
import path from "node:path"
import { waitForCondition } from "./cdp.mjs"
import { journeyBoot } from "./journeys.mjs"
import { mentionsPath } from "./paths.mjs"
import { parseArgs, runHarness } from "./run.mjs"
import { SettingsWebMcpAudit } from "./settings-webmcp.mjs"
import { parseStubOrigin } from "./stub-origin.mjs"
import { longTasksWithin, manyBlocksMarkdown, openFenceMarkdown, summarizeSamples } from "./trace-stats.mjs"

const argv = process.argv.slice(2)
const option = (name, fallback) => {
  const index = argv.indexOf(name)
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback
}
const positiveInt = (value, fallback) => {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}
const args = parseArgs(argv)
const RUNS = positiveInt(option("--runs", "3"), 3)
// The Worker rejects inputs above 1,000,000 code units; stay below that cap.
const SIZES = option("--sizes", "100000,300000")
  .split(",")
  .map((value) => Math.min(positiveInt(value, 0), 950_000))
  .filter((value) => value > 0)
const FENCE_SIZE = Math.min(positiveInt(option("--fence-size", "200000"), 200_000), 950_000)
const FENCE_APPENDS = 10
const PAINT_TIMEOUT_MS = Math.max(args.timeoutMs, 60_000)

// Installed before the app's own scripts. Records Worker round trips for the Markdown
// parser, long main-thread tasks, and exposes renderer-only event emitters.
const PROBE_SCRIPT = `(() => {
  const trace = window.__trace = { sockets: [], requests: [], responses: [], longTasks: [] }
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) trace.longTasks.push({ start: entry.startTime, duration: entry.duration })
    }).observe({ type: "longtask", buffered: true })
  } catch {}
  window.WebSocket = new Proxy(window.WebSocket, { construct(target, values) {
    const socket = new target(...values)
    trace.sockets.push({ url: String(values[0]), socket })
    return socket
  } })
  window.Worker = new Proxy(window.Worker, { construct(target, values) {
    const worker = new target(...values)
    if (String(values[0]).includes("markdownParser")) {
      const started = new Map()
      const post = worker.postMessage.bind(worker)
      worker.postMessage = (...messages) => {
        const input = messages[0]
        started.set(input.id, performance.now())
        trace.requests.push({ id: input.id, live: input.live, characters: input.text.length, at: performance.now() })
        return post(...messages)
      }
      worker.addEventListener("message", ({ data }) => {
        const start = started.get(data.id)
        trace.responses.push({ id: data.id, blocks: data.blocks?.length, stablePrefixCount: data.stablePrefixCount ?? 0,
          at: performance.now(), elapsedMs: start === undefined ? null : performance.now() - start })
        started.delete(data.id)
      })
    }
    return worker
  } })
  // Resolves with performance.now() on the first animation frame where predicate() holds.
  trace.until = (predicate, timeoutMs) => new Promise((resolve, reject) => {
    const deadline = performance.now() + timeoutMs
    const tick = () => {
      let done = false
      try { done = Boolean(predicate()) } catch {}
      if (done) return resolve(performance.now())
      if (performance.now() > deadline) return reject(new Error("trace.until timed out"))
      requestAnimationFrame(tick)
    }
    tick()
  })
})()`

const openFixtureConversation = async ({ session, e2e, audit }) => {
  await session.send("Page.reload", { ignoreCache: true })
  await journeyBoot({ session })
  const target = e2e.scenario.session
  const conversationShown = 'document.body.innerText.includes("Fixture conversation for project A")'
  // A reload restores the last open conversation; only a fresh profile lands on project cards.
  await audit.wait(
    `${conversationShown} || document.querySelectorAll("[data-project-row]").length >= 2`,
    "project cards or restored conversation",
  )
  if (await session.evaluate(conversationShown)) {
    await audit.wait(
      'window.__trace.sockets.some(x => x.url.includes("/global/event/ws") && x.socket.readyState === 1)',
      "event socket",
    )
    return
  }
  let control
  await waitForCondition(
    async () => {
      control = (await audit.all()).controls.find(
        (entry) =>
          entry.role === "button" && entry.name.includes(target.title) && mentionsPath(entry.name, target.directory),
      )
      return Boolean(control)
    },
    { timeoutMs: 10_000, label: "fixture conversation control" },
  )
  await audit.click(control.name, { role: "button" })
  await audit.wait('document.body.innerText.includes("Fixture conversation for project A")', "fixture conversation")
  await audit.wait(
    'window.__trace.sockets.some(x => x.url.includes("/global/event/ws") && x.socket.readyState === 1)',
    "event socket",
  )
}

// Emits one assistant message as renderer-only events and returns the emit timestamp.
const startMessage = (session, fixture) =>
  session.evaluate(`(() => {
  const fixture = ${JSON.stringify(fixture)}
  const socket = window.__trace.sockets.find(x => x.url.includes('/global/event/ws') && x.socket.readyState === 1).socket
  const emit = payload => socket.dispatchEvent(new MessageEvent('message', {
    data: JSON.stringify({ type: 'event', directory: fixture.directory, payload }) }))
  const messageID = 'msg_zzzz_trace_' + fixture.key
  const partID = 'prt_zzzz_trace_' + fixture.key
  const info = { id: messageID, sessionID: fixture.sessionID, role: 'assistant', parentID: fixture.parentID,
    time: { created: Date.now() }, modelID: 'fixture', providerID: 'fixture', mode: 'build', agent: 'build',
    path: { cwd: fixture.directory, root: fixture.directory } }
  const part = { id: partID, messageID, sessionID: fixture.sessionID, type: 'text', text: fixture.text }
  // Emit from an ordinary page task: work done inside a CDP Runtime.evaluate is not
  // reported by the longtask observer, which would hide synchronous pipeline cost.
  const inTask = (run) => new Promise(resolve => setTimeout(() => {
    const at = performance.now()
    run()
    resolve(at)
  }, 0))
  window.__trace.append = delta => inTask(() => {
    emit({ type: 'message.part.delta', properties: { sessionID: fixture.sessionID, messageID,
      partID, field: 'text', delta, offset: part.text.length } })
    part.text += delta
  })
  window.__trace.finish = () => inTask(() => {
    emit({ type: 'message.part.updated', properties: { part: { ...part, time: { start: info.time.created, end: Date.now() } } } })
    emit({ type: 'message.updated', properties: { info: { ...info, time: { ...info.time, completed: Date.now() }, finish: 'stop' } } })
    emit({ type: 'session.status', properties: { sessionID: fixture.sessionID, status: { type: 'idle' } } })
  })
  return inTask(() => {
    emit({ type: 'session.status', properties: { sessionID: fixture.sessionID, status: { type: 'busy' } } })
    emit({ type: 'message.updated', properties: { info } })
    emit({ type: 'message.part.updated', properties: { part } })
  })
})()`)

const until = (session, predicate) => session.evaluate(`window.__trace.until(() => ${predicate}, ${PAINT_TIMEOUT_MS})`)

const traceSnapshot = (session) =>
  session.evaluate("({ requests: window.__trace.requests, responses: window.__trace.responses, longTasks: window.__trace.longTasks })")

const heapUsedBytes = async (session) => {
  const { metrics } = await session.send("Performance.getMetrics")
  return metrics.find((metric) => metric.name === "JSHeapUsedSize")?.value ?? null
}

// Worker round trips whose request was posted inside [start, end].
const workerSamples = (snapshot, start, end, { live } = {}) => {
  const requests = snapshot.requests.filter(
    (request) => request.at >= start && request.at <= end && (live === undefined || request.live === live),
  )
  return requests
    .map((request) => snapshot.responses.find((response) => response.id === request.id)?.elapsedMs)
    .filter((value) => Number.isFinite(value))
}

// Splits cold paint into: emit -> first parser request, parse round trip, last response -> paint.
const coldPhases = (snapshot, start, end) => {
  const requests = snapshot.requests.filter((request) => request.at >= start && request.at <= end)
  const responses = snapshot.responses.filter((response) => requests.some((request) => request.id === response.id))
  if (requests.length === 0 || responses.length === 0) return { toFirstRequestMs: null, lastResponseToPaintMs: null }
  return {
    toFirstRequestMs: requests[0].at - start,
    lastResponseToPaintMs: end - Math.max(...responses.map((response) => response.at)),
    requests: requests.length,
  }
}

const headingPredicate = (sections) =>
  `(() => { const h = document.querySelectorAll("h2"); return h.length >= ${sections} && ` +
  `Array.prototype.some.call(h, x => x.textContent === "Trace section ${sections - 1}") })()`

const traceManyBlocks = async ({ session, fixture, size, run }) => {
  const { text, sections } = manyBlocksMarkdown(size)
  const emitted = await startMessage(session, { ...fixture, key: `blocks_${size}_${run}`, text })
  // The unparsed source is shown while the Worker runs, so this marks the message mount.
  const firstText = await until(session, 'document.body.textContent.includes("Trace section 0")')
  const painted = await until(session, headingPredicate(sections))
  const afterPaint = await traceSnapshot(session)
  const finishAt = await session.evaluate("window.__trace.finish()")
  // Final (non-live) parse of the completed message, then its paint.
  await until(
    session,
    `window.__trace.requests.some(r => !r.live && r.at >= ${finishAt} && window.__trace.responses.some(x => x.id === r.id))`,
  )
  const finalized = await until(session, headingPredicate(sections))
  const afterFinal = await traceSnapshot(session)

  // Re-theme the large document: a cold first run once exceeded a 10 s wait here.
  const themeStart = await session.evaluate("performance.now()")
  await session.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }] })
  const themed = await until(session, '!document.documentElement.classList.contains("dark")')
  await session.send("Emulation.setEmulatedMedia", { features: [] })
  const afterTheme = await traceSnapshot(session)

  return {
    characters: text.length,
    sections,
    coldPaintMs: painted - emitted,
    coldWorkerMs: workerSamples(afterPaint, emitted, painted),
    coldPhases: { ...coldPhases(afterPaint, emitted, painted), toFirstTextMs: firstText - emitted },
    coldLongTasks: longTasksWithin(afterPaint.longTasks, emitted, painted),
    finalizeMs: finalized - finishAt,
    finalizeWorkerMs: workerSamples(afterFinal, finishAt, finalized, { live: false }),
    finalizeLongTasks: longTasksWithin(afterFinal.longTasks, finishAt, finalized),
    themeSwitchMs: themed - themeStart,
    themeLongTasks: longTasksWithin(afterTheme.longTasks, themeStart, themed),
    heapUsedBytes: await heapUsedBytes(session),
  }
}

const traceOpenFence = async ({ session, fixture, run }) => {
  const marker = `FENCE_TRACE_END_${run}`
  const text = openFenceMarkdown(FENCE_SIZE, marker)
  const textPredicate = (value) =>
    `Array.prototype.some.call(document.querySelectorAll("pre"), x => x.textContent.includes(${JSON.stringify(value)}))`
  const emitted = await startMessage(session, { ...fixture, key: `fence_${run}`, text })
  const painted = await until(session, textPredicate(marker))
  const appends = []
  for (let index = 0; index < FENCE_APPENDS; index += 1) {
    const appendMarker = `FENCE_APPEND_${run}_${index}`
    const at = await session.evaluate(`window.__trace.append(${JSON.stringify(`\n${appendMarker}`)})`)
    const shown = await until(session, textPredicate(appendMarker))
    appends.push({ at, shown })
  }
  const snapshot = await traceSnapshot(session)
  const first = appends[0].at
  const last = appends.at(-1).shown
  return {
    characters: text.length,
    coldPaintMs: painted - emitted,
    coldLongTasks: longTasksWithin(snapshot.longTasks, emitted, painted),
    appendPaintMs: appends.map((entry) => entry.shown - entry.at),
    appendWorkerMs: workerSamples(snapshot, first, last, { live: true }),
    appendLongTasks: longTasksWithin(snapshot.longTasks, first, last),
    heapUsedBytes: await heapUsedBytes(session),
  }
}

const summarizeBlocks = (samples) => ({
  characters: samples[0]?.characters,
  sections: samples[0]?.sections,
  coldPaintMs: summarizeSamples(samples.map((sample) => sample.coldPaintMs)),
  coldWorkerMs: summarizeSamples(samples.flatMap((sample) => sample.coldWorkerMs)),
  coldToFirstRequestMs: summarizeSamples(samples.map((sample) => sample.coldPhases.toFirstRequestMs)),
  coldResponseToPaintMs: summarizeSamples(samples.map((sample) => sample.coldPhases.lastResponseToPaintMs)),
  coldToFirstTextMs: summarizeSamples(samples.map((sample) => sample.coldPhases.toFirstTextMs)),
  coldLongTaskMaxMs: summarizeSamples(samples.map((sample) => sample.coldLongTasks.maxMs)),
  finalizeMs: summarizeSamples(samples.map((sample) => sample.finalizeMs)),
  finalizeWorkerMs: summarizeSamples(samples.flatMap((sample) => sample.finalizeWorkerMs)),
  themeSwitchMs: summarizeSamples(samples.map((sample) => sample.themeSwitchMs)),
  heapUsedMiB: summarizeSamples(samples.map((sample) => sample.heapUsedBytes / 1048576)),
})

const summarizeFence = (samples) => ({
  characters: samples[0]?.characters,
  coldPaintMs: summarizeSamples(samples.map((sample) => sample.coldPaintMs)),
  appendPaintMs: summarizeSamples(samples.flatMap((sample) => sample.appendPaintMs)),
  appendWorkerMs: summarizeSamples(samples.flatMap((sample) => sample.appendWorkerMs)),
  appendLongTaskMaxMs: summarizeSamples(samples.map((sample) => sample.appendLongTasks.maxMs)),
  heapUsedMiB: summarizeSamples(samples.map((sample) => sample.heapUsedBytes / 1048576)),
})

const formatSummary = (summary) =>
  `p50 ${summary.p50 ?? "-"} / p95 ${summary.p95 ?? "-"} / max ${summary.max ?? "-"} (n=${summary.count})`

let receipt = null
const outcome = await runHarness({
  ...args,
  timeoutMs: args.timeoutMs,
  uiWebMcp: true,
  portfolio: true,
  journeys: [
    journeyBoot,
    async function journeyMarkdownTrace({ session, e2e }) {
      await session.send("Page.addScriptToEvaluateOnNewDocument", { source: PROBE_SCRIPT })
      await session.send("Performance.enable")
      const origin = parseStubOrigin(await fs.readFile(e2e.stubOriginPath, "utf8"))
      const armed = await fetch(`${origin}/__e2e__/step`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ step: "portfolio-goals" }),
        redirect: "error",
      })
      if (!armed.ok) throw new Error("Could not arm fixture conversations")
      const audit = new SettingsWebMcpAudit(session)
      await audit.client.enable()
      const target = e2e.scenario.session
      const fixture = { directory: target.directory, sessionID: target.id, parentID: "msg_e2e_portfolio_0" }

      const blocks = Object.fromEntries(SIZES.map((size) => [size, []]))
      const fence = []
      for (let run = 0; run < RUNS; run += 1) {
        for (const size of SIZES) {
          await openFixtureConversation({ session, e2e, audit })
          blocks[size].push(await traceManyBlocks({ session, fixture, size, run }))
        }
        await openFixtureConversation({ session, e2e, audit })
        fence.push(await traceOpenFence({ session, fixture, run }))
      }

      receipt = {
        recordedAt: new Date().toISOString(),
        host: { platform: process.platform, arch: process.arch },
        runs: RUNS,
        manyBlocks: Object.fromEntries(SIZES.map((size) => [size, summarizeBlocks(blocks[size])])),
        openFence: summarizeFence(fence),
        samples: { manyBlocks: blocks, openFence: fence },
      }
      if (args.artifacts) {
        await fs.mkdir(args.artifacts, { recursive: true })
        await fs.writeFile(path.join(args.artifacts, "markdown-trace.json"), `${JSON.stringify(receipt, null, 2)}\n`)
      }
      return {
        name: "markdown-trace",
        ok: true,
        detail: `${RUNS} cold run(s) of ${SIZES.join("/")}-character documents and a ${FENCE_SIZE}-character open fence`,
      }
    },
  ],
})
outcome.lines.forEach((line) => console.log(line))
if (receipt) {
  for (const [size, summary] of Object.entries(receipt.manyBlocks)) {
    console.log(`many-blocks ${size} chars (${summary.sections} sections)`)
    console.log(`  cold paint ms       ${formatSummary(summary.coldPaintMs)}`)
    console.log(`  cold worker ms      ${formatSummary(summary.coldWorkerMs)}`)
    console.log(`  emit -> first text  ${formatSummary(summary.coldToFirstTextMs)}`)
    console.log(`  emit -> request ms  ${formatSummary(summary.coldToFirstRequestMs)}`)
    console.log(`  response -> paint   ${formatSummary(summary.coldResponseToPaintMs)}`)
    console.log(`  cold long task max  ${formatSummary(summary.coldLongTaskMaxMs)}`)
    console.log(`  finalize ms         ${formatSummary(summary.finalizeMs)}`)
    console.log(`  finalize worker ms  ${formatSummary(summary.finalizeWorkerMs)}`)
    console.log(`  theme switch ms     ${formatSummary(summary.themeSwitchMs)}`)
    console.log(`  JS heap MiB         ${formatSummary(summary.heapUsedMiB)}`)
  }
  const summary = receipt.openFence
  console.log(`open fence ${summary.characters} chars, ${FENCE_APPENDS} appends per run`)
  console.log(`  cold paint ms       ${formatSummary(summary.coldPaintMs)}`)
  console.log(`  append paint ms     ${formatSummary(summary.appendPaintMs)}`)
  console.log(`  append worker ms    ${formatSummary(summary.appendWorkerMs)}`)
  console.log(`  append long task    ${formatSummary(summary.appendLongTaskMaxMs)}`)
  console.log(`  JS heap MiB         ${formatSummary(summary.heapUsedMiB)}`)
}
process.exitCode = outcome.ok ? 0 : 1
