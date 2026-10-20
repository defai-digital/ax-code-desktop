#!/usr/bin/env node
// Development UI WebMCP lab: isolated app, real native tools, no live model calls.
import fs from "node:fs/promises"
import path from "node:path"
import { CdpSession, isAppPageTarget, listTargets, waitForTarget } from "./cdp.mjs"
import { launchDesktop } from "./launch.mjs"
import { journeyBoot, journeyPreloadBridge, waitForRuntimeReadiness } from "./journeys.mjs"
import { parseArgs, runHarness } from "./run.mjs"
import { UiWebMcpClient, journeyUiWebMcp } from "./ui-webmcp-client.mjs"

const args = process.argv.slice(2).filter((arg) => arg !== "--")

if (args.includes("--smoke")) {
  const outcome = await runHarness({
    ...parseArgs(args),
    uiWebMcp: true,
    journeys: [journeyBoot, journeyPreloadBridge, journeyUiWebMcp],
  })
  outcome.lines.forEach((line) => console.log(line))
  process.exitCode = outcome.ok ? 0 : 1
} else if (args.includes("--connection")) {
  const index = args.indexOf("--connection")
  const file = args[index + 1]
  const [command, name, json] = args.slice(index + 2)
  const record = JSON.parse(await fs.readFile(file, "utf8"))
  if (
    record.schema !== "ax-code-desktop.ui-webmcp.v1" ||
    !Number.isInteger(record.port) ||
    record.port <= 0 ||
    record.port > 65535
  ) {
    throw new Error("Invalid Desktop UI WebMCP connection record")
  }
  const target = (await listTargets(record.port)).find(
    (entry) => entry.id === record.targetId && isAppPageTarget(entry),
  )
  if (!target) throw new Error("The development renderer is no longer available; start a new lab")
  const session = await CdpSession.connect(target.webSocketDebuggerUrl)
  try {
    const client = new UiWebMcpClient(session)
    const tools = await client.enable()
    if (command === "list") console.log(JSON.stringify(tools, null, 2))
    else if (command === "call") console.log(JSON.stringify(await client.call(name, JSON.parse(json ?? "{}")), null, 2))
    else if (command === "screenshot" && name) {
      const { data } = await session.send("Page.captureScreenshot", { format: "png" })
      await fs.writeFile(name, Buffer.from(data, "base64"))
      console.log(`Screenshot written to ${name}`)
    } else throw new Error("Expected list, call <tool> '<json>', or screenshot <path.png>")
  } finally {
    session.close()
  }
} else {
  const launch = await launchDesktop({ uiWebMcp: true })
  let session
  let requestStop
  const stopped = new Promise((resolve) => {
    requestStop = resolve
    launch.child.once("exit", resolve)
  })
  // pnpm and terminal process groups can deliver the same stop signal twice.
  // Keep handlers installed through teardown so a second signal cannot abort cleanup.
  process.on("SIGINT", requestStop)
  process.on("SIGTERM", requestStop)
  try {
    const target = await waitForTarget(launch.debuggingPort, isAppPageTarget)
    session = await CdpSession.connect(target.webSocketDebuggerUrl)
    await waitForRuntimeReadiness({ session, stubOriginPath: launch.stubOriginPath, scenario: launch.scenario })
    await journeyBoot({ session })
    const client = new UiWebMcpClient(session)
    const tools = await client.enable()
    const connection = path.join(launch.tmpDir, "ui-webmcp-connection.json")
    await fs.writeFile(
      connection,
      JSON.stringify({ schema: "ax-code-desktop.ui-webmcp.v1", port: launch.debuggingPort, targetId: target.id }),
      { mode: 0o600 },
    )
    console.log(`Desktop UI WebMCP ready (isolated profile, stub runtime). Connection: ${connection}`)
    console.log(`Tools: ${tools.map((tool) => tool.name).join(", ")}`)
    console.log("Use --connection <file> list | call <tool> '<json>' | screenshot <path.png>. Ctrl+C stops this lab.")
    // Leave the native domain free for short-lived CLI clients.
    session.close()
    session = null
    await stopped
  } catch (error) {
    console.error(launch.stderr.join(""))
    throw error
  } finally {
    session?.close()
    await launch.stop()
    process.removeListener("SIGINT", requestStop)
    process.removeListener("SIGTERM", requestStop)
  }
}
