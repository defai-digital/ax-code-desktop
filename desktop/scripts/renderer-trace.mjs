#!/usr/bin/env node
// Chromium trace breakdown for a streaming assistant message in a running AX Code Desktop renderer.
//
// Attaches to an already running Desktop (or dev) instance started with --remote-debugging-port, opens an existing
// session read-only, injects a synthetic assistant message into the renderer's own event socket (no runtime write,
// no model call) and records a Chromium trace plus frame/long-task samples while the message streams.
//
// Usage:
//   node renderer-trace.mjs --cdp 9339 --origin http://127.0.0.1:58985 --session ses_x --directory /path \
//     --kind paragraph --tail 8000 --rate 20 --delta 80 --seconds 8 --out result.json [--strong 40] [--no-trace]
//
// The summary attributes self time per thread and per event name inside the measurement window. It is a
// measurement tool: it never changes application state outside the renderer's in-memory store.
import { writeFileSync } from "node:fs"

const args = new Map()
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]
  if (!a.startsWith("--")) continue
  const next = process.argv[i + 1]
  if (next === undefined || next.startsWith("--")) args.set(a.slice(2), "true")
  else {
    args.set(a.slice(2), next)
    i++
  }
}
const num = (key, fallback) => (args.has(key) ? Number(args.get(key)) : fallback)
const cfg = {
  cdp: num("cdp", 9339),
  origin: args.get("origin"),
  session: args.get("session"),
  directory: args.get("directory"),
  kind: args.get("kind") ?? "paragraph", // paragraph | blocks
  tail: num("tail", 8000), // characters already present in the open message before measuring
  rate: num("rate", 20), // delta events per second
  delta: num("delta", 80), // characters per delta
  seconds: num("seconds", 8),
  warmupSeconds: num("warmup", 2),
  strong: num("strong", 0), // insert **w** every N characters (formatted nodes); 0 = plain
  parent: args.get("parent"), // id of an existing user message in the session; the injected assistant message joins its turn
  trace: !args.has("no-trace"),
  out: args.get("out") ?? "renderer-trace-result.json",
}
if (!cfg.origin || !cfg.session || !cfg.directory || !cfg.parent) {
  console.error("--origin, --session, --directory and --parent are required")
  process.exit(2)
}

const targets = await (await fetch(`http://127.0.0.1:${cfg.cdp}/json`)).json()
const page = targets.find((t) => t.type === "page" && t.url.startsWith("http"))
if (!page) throw new Error("no http page target")

const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  ws.onopen = resolve
  ws.onerror = reject
})
let nextId = 1
const pending = new Map()
const listeners = []
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data)
  if (msg.id) {
    const p = pending.get(msg.id)
    pending.delete(msg.id)
    if (p) msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result)
  } else {
    for (const l of listeners) l(msg)
  }
}
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = nextId++
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params }))
  })
const evaluate = async (expression, awaitPromise = false) => {
  const r = await send("Runtime.evaluate", { expression, awaitPromise, returnByValue: true })
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 600))
  return r.result.value
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

await send("Page.enable")
await send("Runtime.enable")
await send("Page.addScriptToEvaluateOnNewDocument", {
  source: `(() => {
    const Native = window.WebSocket
    window.__sockets = []
    window.WebSocket = new Proxy(Native, {
      construct(target, a) {
        const s = new target(...a)
        window.__sockets.push({ url: String(a[0]), s })
        return s
      },
    })
  })()`,
})
await send("Page.navigate", { url: `${cfg.origin}/?session=${cfg.session}` })
for (let i = 0; i < 60; i++) {
  await sleep(500)
  const ready = await evaluate(
    `(window.__sockets||[]).some(x=>x.url.includes('/api/global/event/ws') && x.s.readyState===1)`,
  ).catch(() => false)
  if (ready) break
}
await sleep(3000) // let the session hydrate

const scenario = `(async (cfg) => {
  const sock = window.__sockets.find((x) => x.url.includes('/api/global/event/ws'))?.s
  if (!sock) throw new Error('event socket not found')
  const emit = (payload) =>
    sock.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ type: 'event', directory: cfg.directory, payload }) }))
  const words = 'streaming markdown paragraph with inline code and links keeps growing while the renderer must stay responsive'.split(' ')
  let cursor = 0
  const makeText = (n, offsetSeed) => {
    let out = ''
    let sinceStrong = 0
    while (out.length < n) {
      const w = words[(cursor++ + offsetSeed) % words.length]
      if (cfg.kind === 'blocks' && cursor % 24 === 0) out += '\\n\\n'
      if (cfg.strong > 0 && sinceStrong >= cfg.strong) { out += '**' + w + '** '; sinceStrong = 0; continue }
      out += w + ' '
      sinceStrong += w.length + 1
    }
    return out.slice(0, n)
  }
  const mid = 'msg_zzzz_trace_' + Date.now()
  const pid = 'prt_zzzz_trace_' + Date.now()
  let text = makeText(cfg.tail, 0)
  emit({ type: 'message.updated', properties: { info: { id: mid, sessionID: cfg.session, role: 'assistant', time: { created: Date.now() }, parentID: cfg.parent, modelID: 'trace', providerID: 'trace', mode: 'build', agent: 'build', path: { cwd: cfg.directory, root: cfg.directory } } } })
  emit({ type: 'message.part.updated', properties: { part: { id: pid, sessionID: cfg.session, messageID: mid, type: 'text', text } } })
  const frames = []
  let last = performance.now()
  let rafOn = true
  const raf = (t) => { frames.push(t - last); last = t; if (rafOn) requestAnimationFrame(raf) }
  const longTasks = []
  let po
  try { po = new PerformanceObserver((l) => { for (const e of l.getEntries()) longTasks.push(e.duration) }); po.observe({ entryTypes: ['longtask'] }) } catch {}
  await new Promise((r) => setTimeout(r, cfg.warmupSeconds * 1000))
  frames.length = 0; longTasks.length = 0
  window.__traceStartedAt = performance.now()
  const textBefore = document.body.innerText.length
  last = performance.now()
  requestAnimationFrame(raf)
  const total = Math.round(cfg.seconds * cfg.rate)
  const interval = 1000 / cfg.rate
  const t0 = performance.now()
  const lateness = []
  for (let i = 0; i < total; i++) {
    const due = t0 + i * interval
    const wait = due - performance.now()
    if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    lateness.push(performance.now() - due)
    const delta = makeText(cfg.delta, 7)
    emit({ type: 'message.part.delta', properties: { sessionID: cfg.session, messageID: mid, partID: pid, field: 'text', delta, offset: text.length } })
    text += delta
  }
  await new Promise((r) => setTimeout(r, 500))
  rafOn = false
  po?.disconnect()
  const pct = (a, p) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))] }
  return {
    deltas: total,
    finalChars: text.length,
    domNodes: document.getElementsByTagName('*').length,
    renderedTextGrowth: document.body.innerText.length - textBefore,
    frameSamples: frames.length,
    frameP50: pct(frames, 0.5), frameP95: pct(frames, 0.95), frameP99: pct(frames, 0.99), frameMax: Math.max(0, ...frames),
    framesOver20: frames.filter((f) => f > 20).length, gapsOver50: frames.filter((f) => f > 50).length,
    longTaskCount: longTasks.length, longTaskMax: Math.max(0, ...longTasks),
    emitLatenessP95: pct(lateness, 0.95),
    strongNodes: document.querySelectorAll('strong').length,
  }
})(${JSON.stringify({ ...cfg, session: cfg.session, directory: cfg.directory })})`

const events = []
let tracingDone
const tracingComplete = new Promise((r) => (tracingDone = r))
listeners.push((msg) => {
  if (msg.method === "Tracing.dataCollected") events.push(...msg.params.value)
  if (msg.method === "Tracing.tracingComplete") tracingDone()
})

if (cfg.trace) {
  await send("Tracing.start", {
    transferMode: "ReportEvents",
    traceConfig: {
      recordMode: "recordAsMuchAsPossible",
      includedCategories: [
        "devtools.timeline",
        "disabled-by-default-devtools.timeline",
        "disabled-by-default-devtools.timeline.frame",
        "cc",
        "gpu",
        "blink",
        "viz",
        "toplevel",
      ],
    },
  })
}
const metrics = await evaluate(scenario, true)
let analysis = null
if (cfg.trace) {
  await send("Tracing.end")
  await tracingComplete
  analysis = analyze(events, metrics)
}

function analyze(all, m) {
  const threadNames = new Map()
  const processNames = new Map()
  for (const e of all) {
    if (e.ph !== "M") continue
    if (e.name === "thread_name") threadNames.set(`${e.pid}:${e.tid}`, e.args.name)
    if (e.name === "process_name") processNames.set(e.pid, e.args.name)
  }
  const complete = all.filter((e) => e.ph === "X" && typeof e.dur === "number" && e.dur >= 0)
  // Renderer process = the one whose main thread produced the most slices.
  const perPid = new Map()
  for (const e of complete) {
    if (threadNames.get(`${e.pid}:${e.tid}`) === "CrRendererMain") perPid.set(e.pid, (perPid.get(e.pid) ?? 0) + 1)
  }
  const rendererPid = [...perPid.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
  // Window: from the first delta (page marker is page-relative, so use the densest span of the renderer main thread).
  const mainEvents = complete.filter(
    (e) => e.pid === rendererPid && threadNames.get(`${e.pid}:${e.tid}`) === "CrRendererMain",
  )
  const ts = mainEvents.map((e) => e.ts).sort((a, b) => a - b)
  const t1 = ts[ts.length - 1] ?? 0
  const windowUs = (m.deltas / cfg.rate) * 1e6 + 500e3
  const t0 = t1 - windowUs
  const inWin = complete.filter((e) => e.ts >= t0 && e.ts <= t1)

  const byThread = new Map()
  for (const e of inWin) {
    const key = `${e.pid}:${e.tid}`
    if (!byThread.has(key)) byThread.set(key, [])
    byThread.get(key).push(e)
  }
  const classify = (pid, name) => {
    if (pid === rendererPid) {
      if (name === "CrRendererMain") return "renderer.main"
      if (/Compositor$/.test(name) && !/Tile/.test(name)) return "renderer.compositor"
      if (/CompositorTileWorker|Raster/.test(name)) return "renderer.raster"
      return "renderer.other"
    }
    const proc = processNames.get(pid) ?? ""
    if (/GPU/i.test(proc)) return /Viz|Compositor/i.test(name) ? "gpu.viz" : "gpu.main"
    return "other." + (proc || pid)
  }
  const groups = new Map()
  for (const [key, list] of byThread) {
    const [pid] = key.split(":").map(Number)
    const name = threadNames.get(key) ?? "?"
    const group = classify(pid, name)
    // Self time via a nesting stack (events on a thread nest properly).
    list.sort((a, b) => a.ts - b.ts || b.dur - a.dur)
    const stack = []
    const self = new Map()
    let topLevelBusy = 0
    const finish = (frame) => {
      const s = frame.dur - frame.child
      self.set(frame.name, (self.get(frame.name) ?? 0) + s)
    }
    for (const e of list) {
      while (stack.length && stack[stack.length - 1].end <= e.ts) finish(stack.pop())
      if (stack.length) stack[stack.length - 1].child += e.dur
      else topLevelBusy += e.dur
      stack.push({ name: e.name, dur: e.dur, end: e.ts + e.dur, child: 0 })
    }
    while (stack.length) finish(stack.pop())
    const g = groups.get(group) ?? { busyMs: 0, self: new Map(), threads: new Set() }
    g.busyMs += topLevelBusy / 1000
    g.threads.add(name)
    for (const [n, v] of self) g.self.set(n, (g.self.get(n) ?? 0) + v)
    groups.set(group, g)
  }
  const out = {}
  for (const [group, g] of groups) {
    out[group] = {
      busyMs: Math.round(g.busyMs * 10) / 10,
      threads: [...g.threads],
      topSelfMs: [...g.self.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 14)
        .map(([n, v]) => [n, Math.round(v / 100) / 10]),
    }
  }
  return { rendererPid, windowMs: Math.round(windowUs / 1000), groups: out }
}

const result = { config: { ...cfg }, metrics, trace: analysis }
writeFileSync(cfg.out, JSON.stringify(result, null, 2))
console.log(JSON.stringify({ metrics, trace: analysis }, null, 1))
ws.close()
process.exit(0)
