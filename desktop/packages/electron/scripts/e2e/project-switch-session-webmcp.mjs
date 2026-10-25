#!/usr/bin/env node
// Project switch with an open session: the session belongs to exactly one
// project directory. Switching projects must drop the stale selection instead
// of polling its transcript through the new directory (runtime 409/404).
import fs from "node:fs/promises"
import path from "node:path"
import { waitForCondition } from "./cdp.mjs"
import { mentionsPath } from "./paths.mjs"
import { journeyBoot } from "./journeys.mjs"
import { parseArgs, runHarness } from "./run.mjs"
import { SettingsWebMcpAudit } from "./settings-webmcp.mjs"

const args = parseArgs(process.argv.slice(2))
const outcome = await runHarness({
  ...args,
  uiWebMcp: true,
  portfolio: true,
  journeys: [
    journeyBoot,
    async function journeyProjectSwitchSession({ session, e2e }) {
      const origin = (await fs.readFile(e2e.stubOriginPath, "utf8")).trim()
      const armed = await fetch(`${origin}/__e2e__/step`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ step: "portfolio-goals" }),
      })
      if (!armed.ok) throw new Error("Could not arm portfolio goals")
      await session.send("Page.reload", { ignoreCache: true })
      await journeyBoot({ session })

      const audit = new SettingsWebMcpAudit(session, args.artifacts ? path.join(args.artifacts, "pages") : "")
      await audit.client.enable()
      await audit.wait('document.querySelectorAll("[data-project-row]").length >= 2', "project cards")
      const initialControls = await audit.all()
      if (args.artifacts) {
        await fs.mkdir(args.artifacts, { recursive: true })
        await fs.writeFile(path.join(args.artifacts, "controls-initial.json"), JSON.stringify(initialControls, null, 2))
      }

      const sessionA = e2e.scenario.session
      const sessionB = e2e.scenario.portfolio[0].session
      const markerA = "Fixture conversation for project A"
      const responses = []
      const allResponses = []
      session.on("Network.responseReceived", ({ response }) => {
        if (!response.url.includes("/session")) return
        const entry = { url: response.url, status: response.status }
        responses.push(entry)
        allResponses.push(entry)
      })

      const attentionControl = async (session) => {
        const matches = (await audit.all()).controls.filter(
          (control) =>
            control.role === "button" &&
            control.name.includes(session.title) &&
            mentionsPath(control.name, session.directory),
        )
        // The same session is reachable from the Live sidebar and from its
        // Needs You card; either opens the conversation.
        if (!matches.length) {
          throw new Error(`Expected a Needs You action for ${session.directory}, found none`)
        }
        return matches.find((control) => control.name.includes("Blocked")) ?? matches[0]
      }
      const openSessionA = async () => {
        await audit.click((await attentionControl(sessionA)).name, { role: "button" })
        await audit.wait(`document.body.innerText.includes(${JSON.stringify(markerA)})`, "project A conversation")
      }
      const capture = async (name) => {
        if (!args.artifacts) return
        await fs.mkdir(args.artifacts, { recursive: true })
        const { data } = await session.send("Page.captureScreenshot", { format: "png" })
        await fs.writeFile(path.join(args.artifacts, `${name}.png`), Buffer.from(data, "base64"))
        await fs.writeFile(
          path.join(args.artifacts, `${name}.json`),
          JSON.stringify({ controls: (await audit.all()).controls, responses }, null, 2),
        )
      }

      await openSessionA()
      await capture("session-open")

      // Switch the active project from Settings while the chat stays mounted.
      await audit.click("Settings")
      await audit.wait('Boolean(document.querySelector("[data-settings-view]"))', "Settings view")
      await audit.page("Agents")
      const waitProjectMenu = (expanded) =>
        waitForCondition(
          async () => (await audit.find("Switch project", { role: "button" })).expanded === String(expanded),
          { timeoutMs: 10_000, label: `Settings project menu ${expanded ? "open" : "closed"}` },
        )
      await waitProjectMenu(false)
      await audit.click("Switch project")
      await waitProjectMenu(true)
      const option = (await audit.all()).controls.find(
        (control) => control.role === "menuitemradio" && mentionsPath(control.name, sessionB.directory),
      )
      if (!option) throw new Error(`Missing Settings project target for ${sessionB.directory}`)
      await audit.click(option.name, { role: "menuitemradio" })
      await waitProjectMenu(false)
      await audit.click("Close settings")
      await audit.wait('!document.querySelector("[data-settings-view]")', "settings closed")

      // The old conversation must not remain selected in the new project.
      await audit.wait(
        `!document.body.innerText.includes(${JSON.stringify(markerA)})`,
        "stale project A conversation cleared",
      )
      await capture("after-switch")

      // Give any in-flight reads time to settle, then watch longer than one
      // external-session poll interval (3s) for cross-directory transcript
      // requests against project B's directory.
      await new Promise((resolve) => setTimeout(resolve, 1_500))
      responses.length = 0
      await new Promise((resolve) => setTimeout(resolve, 4_500))
      const crossDirectory = responses.filter((entry) => {
        const decoded = decodeURIComponent(entry.url)
        return (
          decoded.includes(sessionA.id) &&
          !decoded.includes(`directory=${sessionA.directory}`) &&
          (entry.status === 404 || entry.status === 409)
        )
      })
      if (crossDirectory.length) {
        throw new Error(
          `Project B polled project A's session through its own directory: ${JSON.stringify(crossDirectory.slice(0, 3))}`,
        )
      }

      // Selecting the session again still opens it in its own project. Cached
      // messages may legitimately answer it without another network read.
      await openSessionA()
      await capture("session-reopened")

      const receipt = {
        sessions: { a: sessionA.id, b: sessionB.id },
        directories: { a: sessionA.directory, b: sessionB.directory },
        responses,
        allResponses,
      }
      if (args.artifacts) {
        await fs.mkdir(args.artifacts, { recursive: true })
        await fs.writeFile(path.join(args.artifacts, "receipt.json"), JSON.stringify(receipt, null, 2))
      }
      return {
        name: "project-switch-session",
        ok: true,
        detail: "Switching projects clears a session from another project and stops cross-directory transcript reads",
      }
    },
  ],
})
for (const line of outcome.lines) console.log(line)
process.exitCode = outcome.ok ? 0 : 1
