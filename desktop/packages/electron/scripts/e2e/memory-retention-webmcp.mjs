#!/usr/bin/env node
// Fixture-backed retained-content and post-GC heap checks in the built Electron renderer.
import fs from "node:fs/promises"
import path from "node:path"
import { waitForCondition } from "./cdp.mjs"
import { mentionsPath } from "./paths.mjs"
import { journeyBoot } from "./journeys.mjs"
import { parseArgs, runHarness } from "./run.mjs"
import { SettingsWebMcpAudit } from "./settings-webmcp.mjs"
import { parseStubOrigin } from "./stub-origin.mjs"

const args = parseArgs(process.argv.slice(2))
const baseline = process.env.AX_MEMORY_EXPECT_UNBOUNDED === "1"
const outcome = await runHarness({
  ...args,
  uiWebMcp: true,
  portfolio: true,
  journeys: [
    journeyBoot,
    async function journeyMemoryRetention({ session, e2e }) {
      const origin = parseStubOrigin(await fs.readFile(e2e.stubOriginPath, "utf8"))
      // Synthetic ids have no canonical transcript. Finish their recovery reads locally so
      // server rate limits and retries do not become protected in-flight load leases.
      let snapshotReads = 0
      session.on("Fetch.requestPaused", async ({ requestId }) => {
        snapshotReads += 1
        await session.send("Fetch.fulfillRequest", {
          requestId,
          responseCode: 200,
          responseHeaders: [{ name: "content-type", value: "application/json" }],
          body: Buffer.from("[]").toString("base64"),
        })
      })
      await session.send("Fetch.enable", {
        patterns: [{ urlPattern: "*/session/ses_memory_*/message*", requestStage: "Request" }],
      })
      const audit = new SettingsWebMcpAudit(session)
      await audit.client.enable()
      const armed = await fetch(`${origin}/__e2e__/step`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ step: "portfolio-goals" }),
      })
      if (!armed.ok) throw new Error("Could not arm the portfolio fixture")
      const target = e2e.scenario.session
      const open = await waitForCondition(
        async () =>
          (await audit.all()).controls.find(
            (control) =>
              control.role === "button" &&
              control.name.includes(target.title) &&
              mentionsPath(control.name, target.directory),
          ),
        { label: "primary fixture conversation control" },
      )
      await audit.click(open.name, { role: "button" })
      await audit.wait(
        'document.body.innerText.includes("Fixture conversation for project A")',
        "primary fixture conversation",
      )
      for (const step of ["reset", "deny"]) {
        const response = await fetch(`${origin}/__e2e__/step`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ step }),
        })
        if (!response.ok) throw new Error(`Could not prepare approval fixture: ${step}`)
      }
      await waitForCondition(() => audit.find("Allow once", { role: "button" }), { label: "pending approval" })
      await session.send("Input.dispatchKeyEvent", { type: "keyDown", key: "d", code: "KeyD", modifiers: 12 })
      await session.send("Input.dispatchKeyEvent", { type: "keyUp", key: "d", code: "KeyD", modifiers: 0 })
      await audit.wait('document.body.innerText.includes("Debug Panel")', "memory debug panel")
      let latest = null
      session.on("Runtime.consoleAPICalled", async (event) => {
        if (event.args?.[0]?.value !== "[DebugPanel] Session store state:") return
        const objectId = event.args[1]?.objectId
        if (!objectId) return
        const result = await session.send("Runtime.callFunctionOn", {
          objectId,
          functionDeclaration:
            "function() { return { cachedSessions: this.cachedSessions, retention: this.retention }; }",
          returnByValue: true,
        })
        latest = result.result?.value ?? null
      })
      const read = async () => {
        latest = null
        await audit.click("Log State", { role: "button" })
        return waitForCondition(() => latest, { label: "fresh retention diagnostic" })
      }
      const collect = async () => {
        await session.send("HeapProfiler.collectGarbage")
        await session.send("HeapProfiler.collectGarbage")
        return { heap: await session.send("Runtime.getHeapUsage"), dom: await session.send("Memory.getDOMCounters") }
      }
      const publications = []
      const publish = async (batch) => {
        const response = await fetch(`${origin}/__e2e__/step`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ step: "memory-retention", batch }),
        })
        if (!response.ok) throw new Error(`Memory fixture batch ${batch} failed`)
        publications.push(await response.json())
      }
      // Shell readiness can precede the live subscription. Re-publish one fixed warm-up batch
      // until the renderer observes it, so both revisions start from a verified event barrier.
      try {
        await waitForCondition(
          async () => {
            await publish(20)
            return (await read()).cachedSessions?.includes("ses_memory_004199")
          },
          { timeoutMs: 20_000, intervalMs: 500, label: "live event ingestion barrier" },
        )
      } catch (error) {
        throw new Error(
          `${error.message}; publications=${JSON.stringify(publications)}; latest=${JSON.stringify(latest)}`,
        )
      }
      await waitForCondition(async () => baseline || (await read()).cachedSessions.length <= 40, {
        label: "warm-up retention sweep",
      })
      const checkpoints = [{ batch: -1, state: await read(), ...(await collect()) }]
      for (let batch = 0; batch < 5; batch += 1) {
        await publish(batch)
        const expectedLast = `ses_memory_${String(batch * 200 + 199).padStart(6, "0")}`
        const state = await waitForCondition(
          async () => {
            const value = await read()
            if (!value.cachedSessions?.includes(expectedLast)) return null
            if (!baseline && value.cachedSessions.length > 40) return null
            return value
          },
          { timeoutMs: 20_000, intervalMs: 250, label: `retained content after batch ${batch}` },
        )
        checkpoints.push({ batch, state, ...(await collect()) })
      }
      // Cleanup must preserve the user request as well as release message payloads.
      await audit.find("Allow once", { role: "button" })
      const warmPartMessages = checkpoints[0].state.retention?.partMessages
      if (!baseline && checkpoints.slice(1).some((entry) => entry.state.retention?.partMessages > warmPartMessages)) {
        throw new Error("Part payloads outlived the retained session budget")
      }
      const counts = checkpoints.slice(1).map((entry) => entry.state.cachedSessions.length)
      if (baseline) {
        if (counts.at(-1) < 1000) throw new Error(`Baseline did not reproduce retention: ${counts}`)
      } else {
        if (counts.some((count) => count > 40)) throw new Error(`Retained session budget exceeded: ${counts}`)
        const warm = checkpoints[2].heap.usedSize
        const final = checkpoints.at(-1).heap.usedSize
        // Allow bounded caches, diagnostics and snapshot-recovery tombstones to warm up.
        if (final - warm > 12 * 1024 * 1024) throw new Error(`Post-GC heap grew by ${final - warm} bytes after warm-up`)
      }
      if (args.artifacts) {
        await fs.mkdir(args.artifacts, { recursive: true })
        await fs.writeFile(
          path.join(args.artifacts, "memory-checkpoints.json"),
          JSON.stringify({ baseline, snapshotReads, checkpoints }, null, 2),
        )
        await fs.writeFile(
          path.join(args.artifacts, "memory-controls.json"),
          JSON.stringify(await audit.all(), null, 2),
        )
        const { data } = await session.send("Page.captureScreenshot", { format: "png" })
        await fs.writeFile(path.join(args.artifacts, "memory-final.png"), Buffer.from(data, "base64"))
      }
      return {
        name: "memory-retention",
        ok: true,
        detail: `retained sessions: ${counts.join(", ")}`,
        baseline,
        snapshotReads,
        counts,
        heapUsedBytes: checkpoints.map((entry) => entry.heap.usedSize),
        note: "Five fixture batches; renderer post-GC heap, not total app RSS or a production soak.",
      }
    },
  ],
})
console.log(JSON.stringify(outcome, null, 2))
process.exitCode = outcome.ok ? 0 : 1
