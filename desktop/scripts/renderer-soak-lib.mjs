// Pure helpers for the desktop session soak (SPEC-2026-10-19-desktop-session-soak-v1).
// No Electron, CDP, or filesystem access: the driver in renderer-soak.mjs supplies those.

export const BYTES_PER_MIB = 1024 * 1024

export const DEFAULTS = {
  seconds: 600,
  warmup: 120,
  rate: 1,
  interval: 30,
  out: "renderer-soak-result.json",
}

// Heap must stay under 2 MiB/min. Listeners and documents must not grow.
// slopeTolerance covers floating-point noise on a flat series (far below one
// retained listener or document over any scored window of two or more samples).
// deltaTolerance stays 0: a counter that finishes higher than it started retained
// something. Shrinking is allowed. These constants are the spec's starting
// budgets; they are not loosened to make a run pass.
export const BUDGET_NOTES = {
  heapUsedBytes:
    "Pass only when least-squares growth is under 2 MiB per minute. The cap itself fails.",
  jsEventListeners:
    "Zero net growth. Slope may be at most 1e-6 per minute (numeric noise). First-to-last must be <= 0.",
  documents:
    "Zero net growth, same numeric tolerance as listeners. A retained document is an integer step and fails.",
}

export const BUDGETS = {
  heapUsedBytes: {
    maxSlopePerMinute: 2 * BYTES_PER_MIB,
    exclusiveMax: true,
    slopeTolerance: 0,
  },
  jsEventListeners: {
    maxSlopePerMinute: 0,
    maxDelta: 0,
    exclusiveMax: false,
    slopeTolerance: 1e-6,
    deltaTolerance: 0,
  },
  documents: {
    maxSlopePerMinute: 0,
    maxDelta: 0,
    exclusiveMax: false,
    slopeTolerance: 1e-6,
    deltaTolerance: 0,
  },
}

export const METRICS = [
  { key: "heapUsedBytes", budget: "heapUsedBytes" },
  { key: "heapTotalBytes" },
  { key: "domNodes" },
  { key: "documents", budget: "documents" },
  { key: "jsEventListeners", budget: "jsEventListeners" },
  { key: "rendererRssBytes" },
  { key: "mainRssBytes" },
]

export const EVENT_SOCKET_PATH = "/api/global/event/ws"
export const DELTA_TEXT = "streaming soak paragraph "
export const DELTAS_PER_CYCLE = 4

export const SAMPLING_METHODS = {
  systemInfo: "SystemInfo.getProcessInfo on the browser CDP target; resident size from ps",
  processTree: "ps process tree of the launched pid (browser CDP SystemInfo was unavailable)",
}

// Installed with Page.addScriptToEvaluateOnNewDocument, same capture as renderer-trace.mjs.
export const SOCKET_HOOK = `(() => {
  const Native = window.WebSocket
  window.__sockets = []
  window.WebSocket = new Proxy(Native, {
    construct(target, args) {
      const socket = new target(...args)
      window.__sockets.push({ url: String(args[0]), s: socket })
      return socket
    },
  })
})()`

export const EMITTER_SOURCE = `window.__soakEmit = (frameOrFrames) => {
  const frames = Array.isArray(frameOrFrames) ? frameOrFrames : [frameOrFrames]
  const sockets = window.__sockets || []
  let socket = null
  for (let index = sockets.length - 1; index >= 0; index -= 1) {
    const entry = sockets[index]
    if (entry && String(entry.url).includes(${JSON.stringify(EVENT_SOCKET_PATH)}) && entry.s && entry.s.readyState === 1) {
      socket = entry.s
      break
    }
  }
  if (!socket) throw new Error("event socket not found")
  for (const frame of frames) {
    socket.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(frame) }))
  }
  return frames.length
}`

const OPTION_KEYS = new Map([
  ["seconds", "seconds"],
  ["warmup", "warmup"],
  ["rate", "rate"],
  ["interval", "interval"],
  ["out", "out"],
])

const finiteNumber = (flag, value) => {
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${flag} needs a value`)
  }
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) throw new Error(`${flag} must be a finite number`)
  return parsed
}

/** Parse soak CLI args. Unknown flags and inverted windows throw. */
export const parseSoakArgs = (argv) => {
  const result = { ...DEFAULTS }
  const args = Array.isArray(argv) ? argv : []
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === "--") continue
    if (typeof arg !== "string" || !arg.startsWith("--")) {
      throw new Error(`Unexpected argument ${String(arg)}`)
    }
    const body = arg.slice(2)
    const equals = body.indexOf("=")
    const name = equals === -1 ? body : body.slice(0, equals)
    const key = OPTION_KEYS.get(name)
    if (!key) throw new Error(`Unknown option --${name}`)
    const inline = equals === -1 ? undefined : body.slice(equals + 1)
    if (key === "out") {
      const value = inline !== undefined ? inline : args[index + 1]
      if (inline === undefined) index += 1
      if (typeof value !== "string" || value.length === 0 || value.startsWith("--")) {
        throw new Error("--out needs a file path")
      }
      result.out = value
      continue
    }
    const value = inline !== undefined ? inline : args[index + 1]
    if (inline === undefined) index += 1
    result[key] = finiteNumber(`--${name}`, value)
  }
  if (!(result.seconds > 0)) throw new Error("--seconds must be greater than 0")
  if (!(result.warmup >= 0) || result.warmup >= result.seconds) {
    throw new Error("--warmup must be >= 0 and shorter than --seconds (the default warmup is 120s)")
  }
  if (!(result.rate > 0)) throw new Error("--rate must be greater than 0")
  if (!(result.interval > 0)) throw new Error("--interval must be greater than 0")
  return result
}

/**
 * Least-squares slope of y against x. Returns null when the slope is undefined
 * (fewer than two finite points, or every x is the same).
 */
export const leastSquaresSlope = (points) => {
  if (!Array.isArray(points) || points.length < 2) return null
  let sumX = 0
  let sumY = 0
  for (const point of points) {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return null
    sumX += point.x
    sumY += point.y
  }
  const meanX = sumX / points.length
  const meanY = sumY / points.length
  let numerator = 0
  let denominator = 0
  for (const point of points) {
    const dx = point.x - meanX
    numerator += dx * (point.y - meanY)
    denominator += dx * dx
  }
  if (denominator === 0) return null
  return numerator / denominator
}

export const slopeWithinBudget = (slope, budget) => {
  if (!budget || !Number.isFinite(slope) || !Number.isFinite(budget.maxSlopePerMinute)) return false
  const tolerance = budget.slopeTolerance ?? 0
  if (budget.exclusiveMax) return slope < budget.maxSlopePerMinute + tolerance
  return slope <= budget.maxSlopePerMinute + tolerance
}

export const deltaWithinBudget = (delta, budget) => {
  if (!budget || !Number.isFinite(delta)) return false
  if (budget.maxDelta === undefined) return true
  const tolerance = budget.deltaTolerance ?? 0
  return delta <= budget.maxDelta + tolerance
}

const compareNumbers = (left, right) => (left < right ? -1 : left > right ? 1 : 0)

/** Scored-window slope (per minute) and first-to-last difference for one metric. */
export const summarizeMetric = (samples, key, warmupMs) => {
  const scored = (Array.isArray(samples) ? samples : [])
    .filter((sample) => sample && Number.isFinite(sample.elapsedMs) && sample.elapsedMs >= warmupMs)
    .sort((left, right) => compareNumbers(left.elapsedMs, right.elapsedMs))
  const points = []
  for (const sample of scored) {
    const y = sample[key]
    if (!Number.isFinite(y)) return { ok: false, reason: `sample for ${key} is not numeric` }
    points.push({ x: sample.elapsedMs / 60_000, y })
  }
  if (points.length < 2) return { ok: false, reason: `fewer than 2 scored samples for ${key}` }
  const slopePerMinute = leastSquaresSlope(points)
  if (slopePerMinute === null) return { ok: false, reason: `slope for ${key} is undefined` }
  const first = points[0].y
  const last = points[points.length - 1].y
  return { ok: true, slopePerMinute, first, last, delta: last - first, samples: points.length }
}

const budgetFailureReason = (summary, budget, slopeOk, deltaOk) => {
  const parts = []
  if (!slopeOk) {
    const limit = budget.exclusiveMax ? "under" : "at most"
    parts.push(`slope ${summary.slopePerMinute} per minute is not ${limit} ${budget.maxSlopePerMinute}`)
  }
  if (!deltaOk) parts.push(`first-last ${summary.delta} is above ${budget.maxDelta}`)
  return parts.join("; ")
}

export const judgeMetric = (key, summary, budget) => {
  if (!summary?.ok) {
    return { key, ok: false, verdict: "fail", reason: summary?.reason || `no summary for ${key}` }
  }
  const base = {
    key,
    slopePerMinute: summary.slopePerMinute,
    first: summary.first,
    last: summary.last,
    delta: summary.delta,
    samples: summary.samples,
  }
  if (!budget) return { ...base, ok: true, verdict: "reported" }
  const slopeOk = slopeWithinBudget(summary.slopePerMinute, budget)
  const deltaOk = deltaWithinBudget(summary.delta, budget)
  const ok = slopeOk && deltaOk
  return {
    ...base,
    ok,
    verdict: ok ? "pass" : "fail",
    reason: ok ? undefined : budgetFailureReason(summary, budget, slopeOk, deltaOk),
  }
}

export const judgeRun = (samples, warmupMs, budgets = BUDGETS) => {
  const metrics = {}
  const failures = []
  for (const spec of METRICS) {
    const summary = summarizeMetric(samples, spec.key, warmupMs)
    const judged = judgeMetric(spec.key, summary, spec.budget ? budgets[spec.budget] : undefined)
    metrics[spec.key] = judged
    if (!judged.ok) failures.push(`${spec.key}: ${judged.reason || "failed"}`)
  }
  return { ok: failures.length === 0, failures, metrics }
}

/** Metrics whose scored window rose. Unbudgeted growth is listed; it does not by itself fail. */
export const growingMetrics = (metrics) =>
  Object.values(metrics || {}).filter(
    (summary) =>
      summary &&
      Number.isFinite(summary.slopePerMinute) &&
      Number.isFinite(summary.delta) &&
      (summary.slopePerMinute > 1e-6 || summary.delta > 0),
  )

export const buildSoakReport = ({ samples = [], warmupMs = 0, meta = {}, budgets = BUDGETS } = {}) => {
  const earlyFailure = Boolean(meta.failureReason) && samples.length < 2
  const judged = earlyFailure ? { ok: false, failures: [], metrics: {} } : judgeRun(samples, warmupMs, budgets)
  const hiddenScoredSamples = samples.filter((sample) => sample.scored && sample.pageHidden === true).length
  const reasons = []
  if (meta.failureReason) reasons.push(meta.failureReason)
  if (hiddenScoredSamples > 0) {
    // An occluded window stops requestAnimationFrame, so UI that finishes on a frame (toast dismissal) piles up and looks
    // like a leak. Those counts do not measure retention, so the run is inconclusive rather than a pass or a fail.
    reasons.push(`page was hidden during ${hiddenScoredSamples} scored sample(s); the window must stay visible`)
  } else if (!judged.ok) {
    reasons.push(...judged.failures)
  }
  const failureReason = reasons.length > 0 ? reasons.join("; ") : null
  return {
    ok: failureReason === null,
    inconclusive: hiddenScoredSamples > 0,
    hiddenScoredSamples,
    failureReason,
    directory: meta.directory ?? null,
    directorySource: meta.directorySource ?? null,
    attemptedDirectory: meta.attemptedDirectory ?? null,
    sampling: meta.sampling ?? null,
    options: meta.options ?? null,
    cycles: meta.cycles ?? null,
    probe: meta.probe ?? null,
    budgets,
    budgetNotes: BUDGET_NOTES,
    warmupMs,
    samples,
    metrics: judged.metrics,
    growing: growingMetrics(judged.metrics).map((summary) => summary.key),
    consoleErrors: meta.consoleErrors ?? [],
  }
}

/**
 * One scheduler step. A late caller emits once and jumps ahead, so a stall
 * cannot dump every missed cycle in a single burst.
 */
export const nextDue = (now, nextAt, intervalMs) => {
  if (!(intervalMs > 0) || !Number.isFinite(intervalMs)) throw new Error("interval must be positive")
  if (!Number.isFinite(now) || !Number.isFinite(nextAt)) throw new Error("schedule times must be finite")
  if (now < nextAt) return { due: false, nextAt, skipped: 0 }
  const skipped = Math.floor((now - nextAt) / intervalMs)
  return { due: true, nextAt: nextAt + (skipped + 1) * intervalMs, skipped }
}

/** How many cycles fit in the run at the configured rate (the last partial cycle is not counted). */
export const cycleCountFor = (seconds, rate) => {
  if (!(seconds > 0) || !(rate > 0)) return 0
  return Math.floor(seconds * rate)
}

const eventFrame = (directory, payload) => ({ type: "event", directory, payload })

const sessionInfo = (id, directory, now) => ({
  id,
  title: `Soak ${id}`,
  directory,
  version: "1",
  time: { created: now, updated: now },
})

const userMessage = (id, sessionID, now) => ({
  id,
  sessionID,
  role: "user",
  time: { created: now },
})

const assistantMessage = (id, sessionID, parentID, directory, now) => ({
  id,
  sessionID,
  role: "assistant",
  parentID,
  time: { created: now },
  modelID: "soak",
  providerID: "soak",
  mode: "build",
  agent: "build",
  path: { cwd: directory, root: directory },
})

/**
 * One create-stream-resolve-delete cycle. The assistant message's parentID is
 * the user message created in the same cycle. Frames are the shapes the
 * renderer reducer and the global session store accept.
 */
export const buildCycleFrames = ({ index, directory, now = 0, deltas = DELTAS_PER_CYCLE } = {}) => {
  if (!Number.isInteger(index) || index < 0) throw new Error("cycle index must be a non-negative integer")
  if (typeof directory !== "string" || directory.length === 0) throw new Error("cycle directory is required")
  if (!Number.isFinite(now)) throw new Error("cycle time must be finite")
  if (!Number.isInteger(deltas) || deltas < 1) throw new Error("cycle needs at least one delta")

  const sessionID = `ses_soak_${index}`
  const userID = `msg_soak_user_${index}`
  const assistantID = `msg_soak_assistant_${index}`
  const partID = `prt_soak_${index}`
  const permissionID = `per_soak_${index}`
  const info = sessionInfo(sessionID, directory, now)
  const frames = [
    eventFrame(directory, { type: "session.created", properties: { info } }),
    eventFrame(directory, { type: "message.updated", properties: { info: userMessage(userID, sessionID, now) } }),
    eventFrame(directory, {
      type: "message.updated",
      properties: { info: assistantMessage(assistantID, sessionID, userID, directory, now) },
    }),
    eventFrame(directory, {
      type: "message.part.updated",
      properties: {
        part: { id: partID, sessionID, messageID: assistantID, type: "text", text: "" },
      },
    }),
  ]
  let offset = 0
  for (let deltaIndex = 0; deltaIndex < deltas; deltaIndex += 1) {
    frames.push(
      eventFrame(directory, {
        type: "message.part.delta",
        properties: {
          sessionID,
          messageID: assistantID,
          partID,
          field: "text",
          delta: DELTA_TEXT,
          offset,
        },
      }),
    )
    offset += DELTA_TEXT.length
  }
  frames.push(
    eventFrame(directory, {
      type: "permission.asked",
      properties: {
        id: permissionID,
        sessionID,
        permission: "bash",
        patterns: ["echo soak"],
        metadata: {},
        always: [],
      },
    }),
    eventFrame(directory, {
      type: "permission.replied",
      properties: { sessionID, requestID: permissionID },
    }),
    eventFrame(directory, {
      type: "session.goal",
      properties: {
        sessionID,
        goal: {
          sessionID,
          objective: "Soak cycle",
          status: "active",
          tokensUsed: 0,
          timeUsedSeconds: 0,
          time: { created: now },
        },
      },
    }),
    eventFrame(directory, {
      type: "message.removed",
      properties: { sessionID, messageID: assistantID },
    }),
    eventFrame(directory, {
      type: "message.removed",
      properties: { sessionID, messageID: userID },
    }),
    eventFrame(directory, { type: "session.deleted", properties: { info } }),
  )
  return frames
}

/** base64url path id, same encoding the renderer uses for a project path. */
export const projectIdFromDirectory = (directory) => {
  if (typeof directory !== "string") return ""
  const normalized = directory.trim().replace(/\\/g, "/")
  const trimmed = normalized.length > 1 ? normalized.replace(/\/+$/g, "") : normalized
  if (!trimmed) return ""
  const encoded = Buffer.from(trimmed, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "")
  return `path_${encoded}`
}

export const buildStubSettings = (directory, now = 0) => {
  const path = typeof directory === "string" ? directory.trim().replace(/\/+$/g, "") : ""
  if (!path || path === "/") throw new Error("stub directory must be a real path")
  const id = projectIdFromDirectory(path)
  const project = { id, path, label: "Soak stub", addedAt: now }
  return { lastDirectory: path, projects: [project], activeProjectId: id }
}

export const findEventSocket = (sockets) => {
  if (!Array.isArray(sockets)) return null
  for (let index = sockets.length - 1; index >= 0; index -= 1) {
    const entry = sockets[index]
    if (
      entry &&
      typeof entry.url === "string" &&
      entry.url.includes(EVENT_SOCKET_PATH) &&
      entry.s &&
      entry.s.readyState === 1
    ) {
      return entry.s
    }
  }
  return null
}

/** Browser-target SystemInfo.getProcessInfo rows -> main pid and renderer pids. */
export const pidsFromProcessInfo = (processInfo, rootPid) => {
  const list = Array.isArray(processInfo) ? processInfo : []
  const browsers = list.filter((entry) => entry && entry.type === "browser" && Number.isInteger(entry.id))
  const main = browsers.find((entry) => entry.id === rootPid) || browsers[0]
  const rendererPids = list
    .filter((entry) => entry && entry.type === "renderer" && Number.isInteger(entry.id))
    .map((entry) => entry.id)
  return {
    mainPid: main?.id ?? rootPid,
    rendererPids,
    matchedRoot: main?.id === rootPid,
  }
}

const RENDERER_COMMAND = /(?:^|\s)--type=renderer\b|Helper \(Renderer\)/

/** `ps -Ao pid=,ppid=,rss=,command=` rows. rss is kilobytes, converted to bytes. */
export const parsePsTable = (text) => {
  const rows = []
  for (const line of String(text ?? "").split("\n")) {
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/)
    if (!match) continue
    rows.push({
      pid: Number(match[1]),
      ppid: Number(match[2]),
      rssBytes: Number(match[3]) * 1024,
      command: match[4],
    })
  }
  return rows
}

const descendantsOf = (rows, rootPid) => {
  const children = new Map()
  for (const row of rows) {
    const list = children.get(row.ppid) ?? []
    list.push(row)
    children.set(row.ppid, list)
  }
  const found = []
  const stack = [...(children.get(rootPid) ?? [])]
  const seen = new Set([rootPid])
  while (stack.length > 0) {
    const row = stack.pop()
    if (seen.has(row.pid)) continue
    seen.add(row.pid)
    found.push(row)
    for (const child of children.get(row.pid) ?? []) stack.push(child)
  }
  return found
}

export const rendererPidsFromTree = (rows, rootPid) =>
  descendantsOf(rows, rootPid)
    .filter((row) => RENDERER_COMMAND.test(row.command))
    .map((row) => row.pid)

/** Highest resident size wins. Equal sizes prefer the lower pid so the choice is stable. */
export const pickRendererPid = (rendererPids, rssByPid) => {
  const known = (Array.isArray(rendererPids) ? rendererPids : []).filter(
    (pid) => Number.isInteger(pid) && rssByPid && Number.isFinite(rssByPid.get(pid)),
  )
  if (known.length === 0) return null
  return known.sort((left, right) => rssByPid.get(right) - rssByPid.get(left) || left - right)[0]
}

export const rssMapFromPs = (text) => {
  const map = new Map()
  for (const row of parsePsTable(text)) map.set(row.pid, row.rssBytes)
  return map
}

const isByteMetric = (key) => key.endsWith("Bytes")

const formatValue = (key, value) => {
  if (!Number.isFinite(value)) return "n/a"
  if (isByteMetric(key)) return `${(value / BYTES_PER_MIB).toFixed(3)} MiB`
  if (Number.isInteger(value)) return String(value)
  return value.toFixed(4)
}

const formatSlope = (key, value) => {
  if (!Number.isFinite(value)) return "n/a"
  if (isByteMetric(key)) return `${(value / BYTES_PER_MIB).toFixed(4)} MiB/min`
  return `${value.toFixed(4)}/min`
}

const pad = (value, width) => String(value).padEnd(width)

export const formatSampleTable = (samples) => {
  const header = ["t(s)", "scored", "heap", "nodes", "docs", "listeners", "renderer", "main"]
  const rows = [header]
  for (const sample of samples || []) {
    rows.push([
      (Number(sample.elapsedMs) / 1000).toFixed(1),
      sample.scored ? "yes" : "no",
      formatValue("heapUsedBytes", sample.heapUsedBytes),
      formatValue("domNodes", sample.domNodes),
      formatValue("documents", sample.documents),
      formatValue("jsEventListeners", sample.jsEventListeners),
      formatValue("rendererRssBytes", sample.rendererRssBytes),
      formatValue("mainRssBytes", sample.mainRssBytes),
    ])
  }
  const widths = header.map((_, column) => Math.max(...rows.map((row) => row[column].length)))
  return rows.map((row) => row.map((cell, column) => pad(cell, widths[column])).join("  ")).join("\n")
}

export const formatSummaryTable = (metrics) => {
  const header = ["metric", "slope/min", "first", "last", "delta", "verdict"]
  const rows = [header]
  for (const spec of METRICS) {
    const summary = metrics?.[spec.key]
    if (!summary) continue
    rows.push([
      spec.key,
      formatSlope(spec.key, summary.slopePerMinute),
      formatValue(spec.key, summary.first),
      formatValue(spec.key, summary.last),
      formatValue(spec.key, summary.delta),
      summary.verdict || (summary.ok ? "pass" : "fail"),
    ])
  }
  const widths = header.map((_, column) => Math.max(...rows.map((row) => String(row[column]).length)))
  return rows.map((row) => row.map((cell, column) => pad(cell, widths[column])).join("  ")).join("\n")
}

export const formatSoakReport = (report) => {
  const lines = [
    `verdict: ${report?.ok ? "PASS" : "FAIL"}${report?.failureReason ? ` (${report.failureReason})` : ""}`,
    `directory: ${report?.directory ?? "unknown"} (${report?.directorySource ?? "unreported"})`,
    `sampling: ${report?.sampling?.method ?? "unreported"}`,
    "",
    "samples",
    formatSampleTable(report?.samples),
    "",
    "scored window",
    formatSummaryTable(report?.metrics),
  ]
  if (Array.isArray(report?.growing) && report.growing.length > 0) {
    lines.push("", `growing: ${report.growing.join(", ")}`)
  }
  return lines.join("\n")
}
