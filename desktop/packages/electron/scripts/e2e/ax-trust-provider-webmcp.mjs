#!/usr/bin/env node
import path from "node:path"
import { journeyBoot } from "./journeys.mjs"
import { parseArgs, runHarness } from "./run.mjs"
import { SettingsWebMcpAudit } from "./settings-webmcp.mjs"

const args = parseArgs(process.argv.slice(2))
const outcome = await runHarness({
  ...args,
  uiWebMcp: true,
  journeys: [
    journeyBoot,
    async function journeyAxTrustProvider({ session }) {
      // The isolated runtime returns an empty provider catalog. Setup must still be reachable.
      const audit = new SettingsWebMcpAudit(session, args.artifacts ? path.join(args.artifacts, "pages") : "")
      await audit.client.enable()
      await audit.click("Settings")
      await audit.wait('Boolean(document.querySelector("[data-settings-view]"))', "Settings view")
      const openTrust = async (mode) => {
        await audit.page("Providers")
        await audit.click("Connect provider", { role: "button" })
        await audit.click("API Cloud Provider", { role: "button" })
        await audit.find("AX Trust", { role: "menuitem" })
        await audit.capture(`${mode} AX Trust category`)
        await audit.click("AX Trust", { role: "menuitem" })
        await audit.click("Select provider", { role: "button" })
        await audit.click("AX Trust", { role: "menuitem" })
        await audit.wait(
          'Boolean(document.querySelector("[data-settings-view] form input[type=password]"))',
          "AX Trust URL/token form",
        )
        await audit.find("Base URL", { role: "input" })
        const form = await session.evaluate(`(() => {
          const form = document.querySelector('[data-settings-view] form')
          return { hasUrl: Boolean(form?.querySelector('input[placeholder="https://api.example.com/v1"]')),
            hasToken: Boolean(form?.querySelector('input[type="password"]')) }
        })()`)
        if (!form.hasUrl || !form.hasToken) throw new Error("AX Trust setup lacks URL/token fields")
        await audit.capture(`${mode} AX Trust form`)
      }
      for (const mode of ["Dark", "Light"]) {
        await audit.page("Appearance")
        await audit.click(mode)
        await audit.wait(`document.documentElement.classList.contains(${JSON.stringify(mode.toLowerCase())})`, `${mode} theme`)
        await openTrust(mode)
      }
      return { name: "ax-trust-provider", ok: true, detail: "Empty runtime catalog still exposes AX Trust and its URL/token form; no credentials submitted" }
    },
  ],
})
for (const line of outcome.lines) console.log(line)
process.exitCode = outcome.ok ? 0 : 1
