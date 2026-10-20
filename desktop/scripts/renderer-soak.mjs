#!/usr/bin/env node
// 10-minute renderer session soak (SPEC-2026-10-19-desktop-session-soak-v1).
//
// Launches the built app against the stub runtime, captures the renderer's
// /api/global/event/ws socket the way renderer-trace.mjs does, and drives a
// create-stream-resolve-delete cycle through that socket. Samples are taken
// after HeapProfiler.collectGarbage. Process resident size comes from ps.
// Pids come from SystemInfo.getProcessInfo on the browser CDP target when that
// domain answers, and otherwise from the launch process tree.
//
// Usage:
//   pnpm run soak:desktop -- [--seconds 600] [--warmup 120] [--rate 1] [--interval 30] [--out file.json]
import { execFile } from "node:child_process"
import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { realpathSync } from "node:fs"
import { CdpSession, isAppPageTarget, waitForCondition, waitForTarget } from "../packages/electron/scripts/e2e/cdp.mjs"
import { SHELL_READY_EXPRESSION } from "../packages/electron/scripts/e2e/journeys.mjs"
import { launchDesktop } from "../packages/electron/scripts/e2e/launch.mjs"
import {
  BYTES_PER_MIB,
  EMITTER_SOURCE,
  EVENT_SOCKET_PATH,
  SAMPLING_METHODS,
  SOCKET_HOOK,
  buildCycleFrames,
  buildSoakReport,
  buildStubSettings,
  formatSoakReport,
  nextDue,
  parsePsTable,
  parseSoakArgs,
  pidsFromProcessInfo,
  pickRendererPid,
  rendererPidsFromTree,
  rssMapFromPs,
} from "./renderer-soak-lib.mjs"

const execFileAsync = promisify(execFile)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const usage = `Usage: pnpm run soak:desktop -- [--seconds 600] [--warmup 120] [--rate 1] [--interval 30] [--out renderer-soak-result.json]`

const DIRECTORY_EXPRESSION = `(() => ({
  lastDirectory: localStorage.getItem("lastDirectory") || "",
  homeDirectory: localStorage.getItem("homeDirectory") || "",
  desktopHome: typeof window.__AX_CODE_DESKTOP_HOME__ === "string" ? window.__AX_CODE_DESKTOP_HOME__ : "",
}))()`

const socketReadyExpression = `(window.__sockets || []).some((entry) => String(entry.url).includes(${JSON.stringify(EVENT_SOCKET_PATH)}) && entry.s && entry.s.readyState === 1)`

const readPs = async (args) => {
  const { stdout } = await execFileAsync("ps", args, { timeout: 5_000, maxBuffer: 8 * 1024 * 1024 })
  return String(stdout)
}

const finite = (value) => Number.isFinite(value)

// macOS hides a covered window and Chromium then stops requestAnimationFrame, which holds UI that finishes on a frame
// (toast dismissal) in memory. Emulating focus keeps the page visible; the sample records whether it worked.
const keepPageVisible = async (session) => {
  await session.send("Emulation.setFocusEmulationEnabled", { enabled: true }).catch(() => {})
  await session.send("Page.bringToFront").catch(() => {})
}

const samplePage = async (session) => {
  if ((await session.evaluate("document.hidden")) === true) await keepPageVisible(session)
  await session.send("HeapProfiler.collectGarbage", {}, { timeoutMs: 30_000 })
  const heap = await session.send("Runtime.getHeapUsage", {}, { timeoutMs: 15_000 })
  const dom = await session.send("Memory.getDOMCounters", {}, { timeoutMs: 15_000 })
  const visibility = await session.evaluate("document.hidden")
  const counters = {
    pageHidden: visibility === true,
    heapUsedBytes: heap.usedSize,
    heapTotalBytes: heap.totalSize,
    domNodes: dom.nodes,
    documents: dom.documents,
    jsEventListeners: dom.jsEventListeners,
  }
  for (const [name, value] of Object.entries(counters)) {
    if (name === "pageHidden") continue
    if (!finite(value)) throw new Error(`CDP sample returned a non-numeric ${name}`)
  }
  return counters
}

const sampleFromTree = async (rootPid) => {
  const rows = parsePsTable(await readPs(["-Ao", "pid=,ppid=,rss=,command="]))
  const rendererPids = rendererPidsFromTree(rows, rootPid)
  const rss = new Map(rows.map((row) => [row.pid, row.rssBytes]))
  const rendererPid = pickRendererPid(rendererPids, rss)
  return {
    method: SAMPLING_METHODS.processTree,
    mainPid: rootPid,
    rendererPid,
    rendererPids,
    matchedRoot: true,
    mainRssBytes: rss.get(rootPid),
    rendererRssBytes: rendererPid === null ? undefined : rss.get(rendererPid),
  }
}

const sampleFromSystemInfo = async (browser, rootPid) => {
  const info = await browser.send("SystemInfo.getProcessInfo", {}, { timeoutMs: 10_000 })
  const selected = pidsFromProcessInfo(info.processInfo, rootPid)
  if (selected.rendererPids.length === 0) throw new Error("SystemInfo listed no renderer process")
  const pids = [selected.mainPid, ...selected.rendererPids]
  const rss = rssMapFromPs(await readPs(["-p", pids.join(","), "-o", "pid=,ppid=,rss=,command="]))
  const rendererPid = pickRendererPid(selected.rendererPids, rss)
  return {
    method: SAMPLING_METHODS.systemInfo,
    mainPid: selected.mainPid,
    rendererPid,
    rendererPids: selected.rendererPids,
    matchedRoot: selected.matchedRoot,
    mainRssBytes: rss.get(selected.mainPid),
    rendererRssBytes: rendererPid === null ? undefined : rss.get(rendererPid),
  }
}

const requireRss = (processes) => {
  if (!finite(processes.mainRssBytes) || !finite(processes.rendererRssBytes)) {
    throw new Error(
      `resident size missing for main pid ${processes.mainPid} or renderer pid ${processes.rendererPid ?? "none"}`,
    )
  }
  return processes
}

const connectBrowser = async (port) => {
  const response = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(2_000) })
  if (!response.ok) throw new Error(`browser CDP version failed with status ${response.status}`)
  const body = await response.json()
  if (typeof body.webSocketDebuggerUrl !== "string" || body.webSocketDebuggerUrl.length === 0) {
    throw new Error("browser CDP websocket url is missing")
  }
  return CdpSession.connect(body.webSocketDebuggerUrl)
}

const chooseDirectory = (info, stubDirectory) => {
  if (info.lastDirectory) {
    return {
      directory: info.lastDirectory,
      directorySource:
        info.lastDirectory === stubDirectory
          ? "stub project lastDirectory"
          : "app lastDirectory (stub project was not kept)",
    }
  }
  if (info.homeDirectory) return { directory: info.homeDirectory, directorySource: "app homeDirectory" }
  if (info.desktopHome) return { directory: info.desktopHome, directorySource: "desktop home" }
  return { directory: "", directorySource: "none" }
}

const runSoak = async (options) => {
  let launch = null
  let session = null
  let browser = null
  const samples = []
  const consoleErrors = []
  let sampling = null
  let directory = null
  let directorySource = null
  let attemptedDirectory = null
  let cycles = { emitted: 0, skipped: 0 }
  let probe = null
  const pushError = (text) => {
    const trimmed = String(text || "").trim().slice(0, 240)
    if (!trimmed || consoleErrors.includes(trimmed) || consoleErrors.length >= 30) return
    consoleErrors.push(trimmed)
  }
  try {
    launch = await launchDesktop()
    const target = await waitForTarget(launch.debuggingPort, isAppPageTarget, { timeoutMs: 45_000 })
    session = await CdpSession.connect(target.webSocketDebuggerUrl)
    session.on("Runtime.exceptionThrown", (params) => {
      const details = params.exceptionDetails || {}
      pushError(details.exception?.description || details.text)
    })
    session.on("Runtime.consoleAPICalled", (params) => {
      if (params.type !== "error") return
      pushError((params.args || []).map((arg) => arg.value ?? arg.description ?? "").join(" "))
    })
    await Promise.all([session.send("Runtime.enable"), session.send("Page.enable"), session.send("Log.enable")])
    await keepPageVisible(session)
    await waitForCondition(() => session.evaluate(SHELL_READY_EXPRESSION), { timeoutMs: 45_000, label: "app shell" })

    const stubDirectory = path.join(launch.tmpDir, "stub-project")
    await fs.mkdir(stubDirectory, { recursive: true })
    const settings = buildStubSettings(stubDirectory, Date.now())
    attemptedDirectory = settings.lastDirectory
    const settingsPath = path.join(launch.tmpDir, "data", "settings.json")
    await fs.mkdir(path.dirname(settingsPath), { recursive: true })
    await fs.writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`)
    await session.evaluate(`(() => {
      const settings = ${JSON.stringify(settings)}
      localStorage.setItem("lastDirectory", settings.lastDirectory)
      localStorage.setItem("projects", JSON.stringify(settings.projects))
      localStorage.setItem("activeProjectId", settings.activeProjectId)
      return settings.lastDirectory
    })()`)

    await session.send("Page.addScriptToEvaluateOnNewDocument", { source: SOCKET_HOOK })
    await session.send("Page.reload", { ignoreCache: true })
    await Promise.all([
      session.send("Runtime.enable"),
      session.send("Page.enable"),
      session.send("HeapProfiler.enable"),
    ])
    await waitForCondition(() => session.evaluate(SHELL_READY_EXPRESSION), {
      timeoutMs: 45_000,
      label: "app shell after reload",
    })
    // Home resolution and the settings fetch land just after first paint. Wait
    // so the directory we drive is the one the child store actually kept.
    await sleep(1_500)

    let previous = ""
    const settleDeadline = Date.now() + 20_000
    while (Date.now() < settleDeadline) {
      const info = await session.evaluate(DIRECTORY_EXPRESSION)
      const chosen = chooseDirectory(info, attemptedDirectory)
      if (chosen.directory && chosen.directory === previous) {
        directory = chosen.directory
        directorySource = chosen.directorySource
        break
      }
      previous = chosen.directory
      await sleep(400)
    }
    if (!directory) throw new Error("the app did not settle on a loaded directory")
    const confirmed = chooseDirectory(await session.evaluate(DIRECTORY_EXPRESSION), attemptedDirectory)
    if (confirmed.directory) {
      directory = confirmed.directory
      directorySource = confirmed.directorySource
    }

    try {
      await waitForCondition(() => session.evaluate(socketReadyExpression), {
        timeoutMs: 45_000,
        label: "event socket",
      })
    } catch (error) {
      const sockets = await session
        .evaluate(
          `(window.__sockets || []).map((entry) => String(entry.url) + " ready=" + (entry.s && entry.s.readyState))`,
        )
        .catch(() => [])
      throw new Error(`${error.message}; sockets: ${JSON.stringify(sockets)}`)
    }
    await session.evaluate(`(() => { ${EMITTER_SOURCE}; return true })()`)

    const probeUrls = []
    session.on("Network.requestWillBeSent", (params) => {
      const url = params.request?.url
      if (typeof url === "string") {
        probeUrls.push(url)
        if (probeUrls.length > 40) probeUrls.shift()
      }
    })
    await session.send("Network.enable")
    const probeFrames = buildCycleFrames({ index: 0, directory, now: Date.now() })
    await session.evaluate(`window.__soakEmit(${JSON.stringify(probeFrames)})`)
    await sleep(1_500)
    const observedRequests = probeUrls.filter((url) => url.includes("ses_soak_0"))
    await session.send("Network.disable").catch(() => {})
    probe = { sessionID: "ses_soak_0", observedRequests: observedRequests.length }
    if (observedRequests.length === 0) {
      throw new Error(
        `probe session ses_soak_0 was not requested by the renderer; recent urls: ${probeUrls.slice(-12).join(" | ") || "(none)"}`,
      )
    }

    try {
      browser = await connectBrowser(launch.debuggingPort)
      sampling = requireRss(await sampleFromSystemInfo(browser, launch.child.pid))
    } catch (error) {
      browser?.close()
      browser = null
      sampling = requireRss(await sampleFromTree(launch.child.pid))
      sampling.fallbackReason = error instanceof Error ? error.message : String(error)
    }

    const started = Date.now()
    const end = started + options.seconds * 1000
    const warmupMs = options.warmup * 1000
    const sampleInterval = options.interval * 1000
    const cycleInterval = 1000 / options.rate
    let nextSample = started
    let nextCycle = started
    let cycleIndex = 1

    const takeSample = async () => {
      if (launch.child.exitCode !== null || launch.child.signalCode) {
        throw new Error(`app exited during the soak (${launch.child.exitCode ?? launch.child.signalCode})`)
      }
      const page = await samplePage(session)
      const processes = requireRss(
        browser ? await sampleFromSystemInfo(browser, launch.child.pid) : await sampleFromTree(launch.child.pid),
      )
      if (sampling?.fallbackReason) processes.fallbackReason = sampling.fallbackReason
      sampling = processes
      const elapsedMs = Date.now() - started
      const sample = {
        elapsedMs,
        scored: elapsedMs >= warmupMs,
        ...page,
        rendererRssBytes: processes.rendererRssBytes,
        mainRssBytes: processes.mainRssBytes,
      }
      samples.push(sample)
      console.error(
        `sample t=${(elapsedMs / 1000).toFixed(0)}s scored=${sample.scored} heap=${(page.heapUsedBytes / BYTES_PER_MIB).toFixed(2)}MiB listeners=${page.jsEventListeners} docs=${page.documents} hidden=${page.pageHidden} nodes=${page.domNodes} renderer=${(processes.rendererRssBytes / BYTES_PER_MIB).toFixed(1)}MiB main=${(processes.mainRssBytes / BYTES_PER_MIB).toFixed(1)}MiB`,
      )
    }

    while (Date.now() < end) {
      if (launch.child.exitCode !== null || launch.child.signalCode) {
        throw new Error(`app exited during the soak (${launch.child.exitCode ?? launch.child.signalCode})`)
      }
      const now = Date.now()
      const sampleDecision = nextDue(now, nextSample, sampleInterval)
      if (sampleDecision.due) {
        await takeSample()
        nextSample = sampleDecision.nextAt
      }
      const cycleNow = Date.now()
      if (cycleNow < end) {
        const cycleDecision = nextDue(cycleNow, nextCycle, cycleInterval)
        if (cycleDecision.due) {
          const frames = buildCycleFrames({ index: cycleIndex, directory, now: cycleNow })
          if (cycleIndex % 10 === 0 && (await session.evaluate("document.hidden")) === true) await keepPageVisible(session)
          await session.evaluate(`window.__soakEmit(${JSON.stringify(frames)})`)
          cycleIndex += 1
          cycles = { emitted: cycles.emitted + 1, skipped: cycles.skipped + cycleDecision.skipped }
          nextCycle = cycleDecision.nextAt
        }
      }
      const wait = Math.min(nextSample, nextCycle, end) - Date.now()
      if (wait > 0) await sleep(wait)
    }
    const last = samples.at(-1)
    if (!last || Date.now() - started - last.elapsedMs > 1_000) await takeSample()

    return buildSoakReport({
      samples,
      warmupMs,
      meta: {
        directory,
        directorySource,
        attemptedDirectory,
        sampling,
        options,
        cycles,
        probe,
        consoleErrors,
      },
    })
  } catch (error) {
    return buildSoakReport({
      samples,
      warmupMs: options.warmup * 1000,
      meta: {
        failureReason: error instanceof Error ? error.message : String(error),
        directory,
        directorySource,
        attemptedDirectory,
        sampling,
        options,
        cycles,
        probe,
        consoleErrors,
      },
    })
  } finally {
    session?.close()
    browser?.close()
    await launch?.stop()
  }
}

const writeReport = async (file, report) => {
  const resolved = path.resolve(file)
  await fs.mkdir(path.dirname(resolved), { recursive: true })
  await fs.writeFile(resolved, `${JSON.stringify(report, null, 2)}\n`)
  return resolved
}

const main = async () => {
  if (process.argv.includes("--help")) {
    console.log(usage)
    return
  }
  let options
  try {
    options = parseSoakArgs(process.argv.slice(2))
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    console.error(usage)
    process.exitCode = 2
    return
  }
  const report = await runSoak(options)
  const written = await writeReport(options.out, report)
  console.log(formatSoakReport(report))
  console.log(`wrote ${written}`)
  if (!report.ok) process.exitCode = 1
}

const isMain = process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
if (isMain) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
