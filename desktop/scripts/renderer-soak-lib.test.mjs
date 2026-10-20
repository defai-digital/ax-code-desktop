import { runInNewContext } from "node:vm"
import { describe, expect, test } from "vitest"

import {
  BUDGETS,
  BYTES_PER_MIB,
  DEFAULTS,
  DELTA_TEXT,
  DELTAS_PER_CYCLE,
  EMITTER_SOURCE,
  EVENT_SOCKET_PATH,
  SOCKET_HOOK,
  buildCycleFrames,
  buildSoakReport,
  buildStubSettings,
  cycleCountFor,
  deltaWithinBudget,
  findEventSocket,
  formatSoakReport,
  growingMetrics,
  judgeMetric,
  leastSquaresSlope,
  nextDue,
  parsePsTable,
  parseSoakArgs,
  pidsFromProcessInfo,
  pickRendererPid,
  projectIdFromDirectory,
  rendererPidsFromTree,
  slopeWithinBudget,
  summarizeMetric,
} from "./renderer-soak-lib.mjs"

const point = (x, y) => ({ x, y })

describe("leastSquaresSlope", () => {
  // Mutation probe: negating the numerator flips the sign and fails this pair.
  test("slope sign probe: an increasing series is positive and a decreasing series is negative", () => {
    const rising = leastSquaresSlope([point(0, 0), point(1, 2), point(2, 4)])
    const falling = leastSquaresSlope([point(0, 4), point(1, 2), point(2, 0)])
    expect(rising).toBeCloseTo(2)
    expect(falling).toBeCloseTo(-2)
    expect(rising).toBeGreaterThan(0)
    expect(falling).toBeLessThan(0)
    expect(leastSquaresSlope([point(0, 5), point(3, 5), point(4, 5)])).toBeCloseTo(0)
  })

  test("returns null when the slope is undefined", () => {
    expect(leastSquaresSlope([point(1, 1)])).toBeNull()
    expect(leastSquaresSlope([point(2, 1), point(2, 9)])).toBeNull()
    expect(leastSquaresSlope([point(0, 0), point(1, Number.NaN)])).toBeNull()
    expect(leastSquaresSlope([])).toBeNull()
  })
})

describe("budget comparison", () => {
  // Mutation probe: flipping < to > (or <= to >=) makes one of these two fail.
  test("budget comparison probe: growth over the cap fails and growth under the cap passes", () => {
    const heap = BUDGETS.heapUsedBytes
    expect(slopeWithinBudget(2 * BYTES_PER_MIB - 1, heap)).toBe(true)
    expect(slopeWithinBudget(2 * BYTES_PER_MIB, heap)).toBe(false)
    expect(slopeWithinBudget(3 * BYTES_PER_MIB, heap)).toBe(false)
    expect(slopeWithinBudget(-BYTES_PER_MIB, heap)).toBe(true)

    const listeners = BUDGETS.jsEventListeners
    expect(slopeWithinBudget(0, listeners)).toBe(true)
    expect(slopeWithinBudget(-2, listeners)).toBe(true)
    expect(slopeWithinBudget(1e-6, listeners)).toBe(true)
    expect(slopeWithinBudget(1e-6 + 1e-5, listeners)).toBe(false)
    expect(deltaWithinBudget(0, listeners)).toBe(true)
    expect(deltaWithinBudget(-1, listeners)).toBe(true)
    expect(deltaWithinBudget(1, listeners)).toBe(false)

    const over = judgeMetric("heapUsedBytes", { ok: true, slopePerMinute: 3 * BYTES_PER_MIB, first: 0, last: 1, delta: 1, samples: 2 }, heap)
    const under = judgeMetric("heapUsedBytes", { ok: true, slopePerMinute: BYTES_PER_MIB, first: 0, last: 1, delta: 1, samples: 2 }, heap)
    expect(over.ok).toBe(false)
    expect(over.verdict).toBe("fail")
    expect(under.ok).toBe(true)
    expect(under.verdict).toBe("pass")
  })

  test("a non-numeric slope fails closed", () => {
    expect(slopeWithinBudget(Number.NaN, BUDGETS.heapUsedBytes)).toBe(false)
    expect(deltaWithinBudget(Number.POSITIVE_INFINITY, BUDGETS.documents)).toBe(false)
  })
})

describe("parseSoakArgs", () => {
  test("defaults to a 10 minute run with 2 minutes of warm-up", () => {
    expect(parseSoakArgs([])).toEqual(DEFAULTS)
    expect(DEFAULTS).toMatchObject({ seconds: 600, warmup: 120, interval: 30 })
  })

  test("reads the smoke-run flags", () => {
    expect(parseSoakArgs(["--seconds", "60", "--warmup", "15", "--rate", "2", "--interval", "5", "--out", "out.json"])).toEqual({
      seconds: 60,
      warmup: 15,
      rate: 2,
      interval: 5,
      out: "out.json",
    })
    expect(parseSoakArgs(["--", "--seconds=45", "--warmup=0", "--out=report.json"]).seconds).toBe(45)
  })

  test("rejects a window that cannot be scored and unknown flags", () => {
    expect(() => parseSoakArgs(["--warmup", "60", "--seconds", "60"])).toThrow(/warmup/)
    expect(() => parseSoakArgs(["--seconds", "0"])).toThrow(/seconds/)
    expect(() => parseSoakArgs(["--rate", "-1"])).toThrow(/rate/)
    expect(() => parseSoakArgs(["--interval", "0"])).toThrow(/interval/)
    expect(() => parseSoakArgs(["--out"])).toThrow(/out/)
    expect(() => parseSoakArgs(["--trace"])).toThrow(/Unknown option/)
    expect(() => parseSoakArgs(["file.json"])).toThrow(/Unexpected argument/)
  })
})

describe("scored window", () => {
  test("ignores warm-up samples when fitting the slope", () => {
    const samples = [
      { elapsedMs: 0, heapUsedBytes: 0 },
      { elapsedMs: 60_000, heapUsedBytes: 0 },
      { elapsedMs: 120_000, heapUsedBytes: 120 },
    ]
    const summary = summarizeMetric(samples, "heapUsedBytes", 60_000)
    expect(summary.ok).toBe(true)
    expect(summary.samples).toBe(2)
    expect(summary.slopePerMinute).toBeCloseTo(120)
    expect(summary.delta).toBe(120)
    expect(summary.first).toBe(0)
    expect(summary.last).toBe(120)
  })

  test("fails closed when the scored window has a single sample", () => {
    const report = buildSoakReport({
      samples: [{ elapsedMs: 0, heapUsedBytes: 0 }],
      warmupMs: 0,
      meta: { failureReason: "CDP sample failed" },
    })
    expect(report.ok).toBe(false)
    expect(report.failureReason).toContain("CDP sample failed")
    expect(report.metrics).toEqual({})
    expect(formatSoakReport(report)).toContain("FAIL")
  })
})

describe("cycle frames", () => {
  test("builds a removable streamed turn whose assistant message has a user parent", () => {
    const frames = buildCycleFrames({ index: 3, directory: "/repo/stub", now: 1_700_000_000_000 })
    expect(frames.every((frame) => frame.type === "event" && frame.directory === "/repo/stub")).toBe(true)
    const types = frames.map((frame) => frame.payload.type)
    expect(types).toEqual([
      "session.created",
      "message.updated",
      "message.updated",
      "message.part.updated",
      ...Array.from({ length: DELTAS_PER_CYCLE }, () => "message.part.delta"),
      "permission.asked",
      "permission.replied",
      "session.goal",
      "message.removed",
      "message.removed",
      "session.deleted",
    ])

    const user = frames[1].payload.properties.info
    const assistant = frames[2].payload.properties.info
    expect(user.role).toBe("user")
    expect(user.parentID).toBeUndefined()
    expect(assistant.role).toBe("assistant")
    expect(assistant.parentID).toBe(user.id)
    expect(assistant.sessionID).toBe("ses_soak_3")
    expect(frames[0].payload.properties.info.time).toEqual({ created: 1_700_000_000_000, updated: 1_700_000_000_000 })

    const deltas = frames.filter((frame) => frame.payload.type === "message.part.delta")
    deltas.forEach((frame, index) => {
      expect(frame.payload.properties.offset).toBe(index * DELTA_TEXT.length)
      expect(frame.payload.properties.delta).toBe(DELTA_TEXT)
      expect(frame.payload.properties.sessionID).toBe(assistant.sessionID)
      expect(frame.payload.properties.messageID).toBe(assistant.id)
    })

    const asked = frames.find((frame) => frame.payload.type === "permission.asked")
    const replied = frames.find((frame) => frame.payload.type === "permission.replied")
    expect(replied.payload.properties.requestID).toBe(asked.payload.properties.id)
    const goal = frames.find((frame) => frame.payload.type === "session.goal").payload.properties
    expect(goal.sessionID).toBe(assistant.sessionID)
    expect(goal.goal).toMatchObject({ sessionID: assistant.sessionID, status: "active", objective: "Soak cycle" })
    expect(frames.at(-1).payload.properties.info.id).toBe("ses_soak_3")
    expect(frames.filter((frame) => frame.payload.type === "message.removed").map((frame) => frame.payload.properties.messageID)).toEqual([
      assistant.id,
      user.id,
    ])
  })

  test("does not share frame objects between cycles", () => {
    const first = buildCycleFrames({ index: 0, directory: "/repo", now: 1 })
    const second = buildCycleFrames({ index: 1, directory: "/repo", now: 2 })
    first[0].payload.properties.info.title = "mutated"
    expect(second[0].payload.properties.info.title).toBe("Soak ses_soak_1")
    expect(first[0].payload.properties.info.id).not.toBe(second[0].payload.properties.info.id)
  })
})

describe("cycle schedule", () => {
  test("emits one late cycle and skips the missed slots", () => {
    expect(nextDue(1000, 0, 400)).toEqual({ due: true, nextAt: 1200, skipped: 2 })
    expect(nextDue(400, 400, 400)).toEqual({ due: true, nextAt: 800, skipped: 0 })
    expect(nextDue(100, 400, 400)).toEqual({ due: false, nextAt: 400, skipped: 0 })
    expect(cycleCountFor(600, 1)).toBe(600)
    expect(cycleCountFor(60, 2)).toBe(120)
    expect(cycleCountFor(0.4, 1)).toBe(0)
  })

  test("rejects a non-positive interval", () => {
    expect(() => nextDue(0, 0, 0)).toThrow(/interval/)
  })
})

describe("stub project id", () => {
  test("uses the renderer's base64url path id", () => {
    const directory = "/tmp/soak"
    const encoded = Buffer.from(directory, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
    expect(projectIdFromDirectory(`${directory}/`)).toBe(`path_${encoded}`)
    const settings = buildStubSettings(directory, 5)
    expect(settings.lastDirectory).toBe(directory)
    expect(settings.activeProjectId).toBe(settings.projects[0].id)
    expect(settings.projects[0].label).toBe("Soak stub")
    expect(() => buildStubSettings("/")).toThrow(/stub directory/)
  })
})

describe("process sampling", () => {
  test("prefers the browser pid that matches the launch and lists renderers", () => {
    const selected = pidsFromProcessInfo(
      [
        { type: "browser", id: 10 },
        { type: "renderer", id: 11 },
        { type: "gpu", id: 12 },
        { type: "renderer", id: 13 },
      ],
      10,
    )
    expect(selected).toMatchObject({ mainPid: 10, rendererPids: [11, 13], matchedRoot: true })
    expect(pidsFromProcessInfo([], 10).mainPid).toBe(10)
  })

  test("reads a ps tree and picks the busiest renderer", () => {
    const text = [
      "  10  1  1000 Electron",
      "  11  10  2000 Electron Helper (Renderer) --type=renderer",
      "  12  10  500 Electron Helper --type=gpu-process",
      "  13  11  9000 Electron Helper (Renderer) --type=renderer",
    ].join("\n")
    const rows = parsePsTable(text)
    expect(rows[0]).toMatchObject({ pid: 10, ppid: 1, rssBytes: 1000 * 1024 })
    expect(rendererPidsFromTree(rows, 10)).toEqual([11, 13])
    const rss = new Map(rows.map((row) => [row.pid, row.rssBytes]))
    expect(pickRendererPid([11, 13], rss)).toBe(13)
    expect(pickRendererPid([11, 14], rss)).toBe(11)
    expect(pickRendererPid([14], rss)).toBeNull()
  })
})

describe("event socket hook", () => {
  test("captures the global event socket and dispatches a frame into it", () => {
    class MessageEvent {
      constructor(type, init) {
        this.type = type
        this.data = init.data
      }
    }
    class Socket {
      constructor(url) {
        this.url = url
        this.readyState = 1
        this.events = []
      }

      dispatchEvent(event) {
        this.events.push(event)
      }
    }
    const window = { WebSocket: Socket }
    const frame = { type: "event", directory: "/repo", payload: { type: "session.created" } }
    runInNewContext(
      `${SOCKET_HOOK}\n${EMITTER_SOURCE}\nnew window.WebSocket("ws://127.0.0.1:9${EVENT_SOCKET_PATH}")\nwindow.__emitted = window.__soakEmit(${JSON.stringify(frame)})`,
      { window, MessageEvent },
    )
    expect(window.__emitted).toBe(1)
    const socket = findEventSocket(window.__sockets)
    expect(socket.url).toContain(EVENT_SOCKET_PATH)
    expect(JSON.parse(socket.events[0].data)).toEqual(frame)
  })

  test("refuses to emit when the event socket is not open", () => {
    class MessageEvent {}
    class Socket {
      constructor(url) {
        this.url = url
        this.readyState = 0
      }
    }
    const window = { WebSocket: Socket }
    expect(() =>
      runInNewContext(`${SOCKET_HOOK}\n${EMITTER_SOURCE}\nnew window.WebSocket("ws://127.0.0.1${EVENT_SOCKET_PATH}")\nwindow.__soakEmit({})`, {
        window,
        MessageEvent,
      }),
    ).toThrow(/event socket not found/)
    expect(findEventSocket(window.__sockets)).toBeNull()
  })
})

describe("report", () => {
  test("names a metric that grows inside an otherwise passing budget", () => {
    const sample = (elapsedMs, heap) => ({
      elapsedMs,
      scored: elapsedMs >= 120_000,
      heapUsedBytes: heap,
      heapTotalBytes: heap,
      domNodes: 10,
      documents: 1,
      jsEventListeners: 4,
      rendererRssBytes: 50 * BYTES_PER_MIB,
      mainRssBytes: 80 * BYTES_PER_MIB,
    })
    const report = buildSoakReport({
      samples: [sample(0, 40 * BYTES_PER_MIB), sample(120_000, 40 * BYTES_PER_MIB), sample(180_000, 41 * BYTES_PER_MIB)],
      warmupMs: 120_000,
      meta: { directory: "/repo/stub", directorySource: "stub project lastDirectory" },
    })
    expect(report.ok).toBe(true)
    expect(report.metrics.heapUsedBytes.verdict).toBe("pass")
    expect(report.metrics.jsEventListeners.verdict).toBe("pass")
    expect(report.metrics.documents.delta).toBe(0)
    expect(report.growing).toContain("heapUsedBytes")
    expect(growingMetrics(report.metrics).some((summary) => summary.key === "jsEventListeners")).toBe(false)
    const printed = formatSoakReport(report)
    expect(printed).toContain("PASS")
    expect(printed).toContain("heapUsedBytes")
    expect(printed).toContain("/repo/stub")
  })

  test("fails when listeners finish higher than they started", () => {
    const sample = (elapsedMs, listeners) => ({
      elapsedMs,
      heapUsedBytes: 1024,
      heapTotalBytes: 2048,
      domNodes: 10,
      documents: 1,
      jsEventListeners: listeners,
      rendererRssBytes: 1024,
      mainRssBytes: 2048,
    })
    const report = buildSoakReport({
      samples: [sample(0, 1), sample(60_000, 4)],
      warmupMs: 0,
    })
    expect(report.ok).toBe(false)
    expect(report.metrics.jsEventListeners.verdict).toBe("fail")
    expect(report.failureReason).toContain("jsEventListeners")
    expect(formatSoakReport(report)).toContain("FAIL")
  })
})

describe("hidden page", () => {
  const sample = (elapsedMs, listeners, pageHidden) => ({
    elapsedMs,
    scored: elapsedMs >= 60_000,
    pageHidden,
    heapUsedBytes: 1024,
    heapTotalBytes: 2048,
    domNodes: 10,
    documents: 1,
    jsEventListeners: listeners,
    rendererRssBytes: 1024,
    mainRssBytes: 2048,
  })

  // An occluded window stops requestAnimationFrame, so toast dismissals pile up and look like a leak.
  test("a hidden scored sample makes the run inconclusive even when listeners grew", () => {
    const report = buildSoakReport({
      samples: [sample(0, 1, false), sample(60_000, 4, false), sample(120_000, 40, true)],
      warmupMs: 60_000,
    })
    expect(report.ok).toBe(false)
    expect(report.inconclusive).toBe(true)
    expect(report.hiddenScoredSamples).toBe(1)
    expect(report.failureReason).toContain("hidden")
    expect(report.failureReason).not.toContain("jsEventListeners")
  })

  test("a hidden warm-up sample does not make the run inconclusive", () => {
    const report = buildSoakReport({
      samples: [sample(0, 1, true), sample(60_000, 4, false), sample(120_000, 4, false)],
      warmupMs: 60_000,
    })
    expect(report.inconclusive).toBe(false)
    expect(report.hiddenScoredSamples).toBe(0)
    expect(report.ok).toBe(true)
  })

  test("a visible run still fails on real growth", () => {
    const report = buildSoakReport({
      samples: [sample(0, 1, false), sample(60_000, 4, false), sample(120_000, 40, false)],
      warmupMs: 60_000,
    })
    expect(report.inconclusive).toBe(false)
    expect(report.ok).toBe(false)
    expect(report.failureReason).toContain("jsEventListeners")
  })
})
