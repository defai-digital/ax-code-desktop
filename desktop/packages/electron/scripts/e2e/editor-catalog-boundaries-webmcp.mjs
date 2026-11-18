#!/usr/bin/env node
// Isolated editor/catalogue qualification; controlled catalog responses, no clone, write or model execution.
import fs from "node:fs/promises"
import path from "node:path"
import { waitForCondition } from "./cdp.mjs"
import { journeyBoot } from "./journeys.mjs"
import { parseArgs, runHarness } from "./run.mjs"
import { SettingsWebMcpAudit } from "./settings-webmcp.mjs"

const args = parseArgs(process.argv.slice(2))
const outcome = await runHarness({
  ...args,
  uiWebMcp: true,
  journeys: [
    journeyBoot,
    async function editorCatalogBoundaries({ session, e2e }) {
      const origin = (await fs.readFile(e2e.stubOriginPath, "utf8")).trim()
      const seeded = await fetch(`${origin}/__e2e__/scheduled-tasks`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tasks: [], fixtureModel: true }),
      })
      if (!seeded.ok) throw new Error("Could not seed editor fixture")
      await session.send("Page.reload")
      await journeyBoot({ session })
      const audit = new SettingsWebMcpAudit(session)
      await audit.client.enable()
      const openCatalog = async () => {
        let catalog
        await waitForCondition(
          async () => {
            const state = await audit.all()
            catalog = state.controls.find(
              (control) => control.role === "button" && control.name.toLowerCase().includes("skills catalog"),
            )
            if (args.artifacts) {
              await fs.mkdir(args.artifacts, { recursive: true })
              await fs.writeFile(path.join(args.artifacts, "catalog-controls.json"), JSON.stringify(state, null, 2))
            }
            return Boolean(catalog)
          },
          { timeoutMs: 10000, label: "loaded Skills sidebar catalogue control" },
        )
        await audit.click(catalog.name, { role: "button" })
      }

      const capture = async (name) => {
        if (!args.artifacts) return
        await fs.mkdir(args.artifacts, { recursive: true })
        const inspection = await session.evaluate(`({theme:document.documentElement.className,
        prompt:document.querySelector('#sched-prompt')?.value,
        dialog:document.querySelector('[role="dialog"]')?.textContent,
        catalogWrites:window.__e2eCatalogWrites ?? 0})`)
        await fs.writeFile(
          path.join(args.artifacts, `${name}.json`),
          JSON.stringify({ state: await audit.all(), inspection }, null, 2),
        )
        const { data } = await session.send("Page.captureScreenshot", { format: "png" })
        await fs.writeFile(path.join(args.artifacts, `${name}.png`), Buffer.from(data, "base64"))
      }
      const commandSelection = async (theme) => {
        await audit.click("New scheduled task")
        await audit.wait("Boolean(document.querySelector('#sched-prompt'))", "scheduled editor")
        const prompt = (await audit.all()).controls.find(
          (control) => control.role === "textarea" && control.name.startsWith("Prompt"),
        )
        if (!prompt) throw new Error("Missing prompt control")
        await audit.fill(prompt.name, "/compact")
        await audit.wait(
          `Array.from(document.querySelectorAll('[role="dialog"] span')).some(e=>e.textContent==='/compact')`,
          "command popup",
        )
        await session.send("Input.dispatchKeyEvent", {
          type: "keyDown",
          key: "Tab",
          code: "Tab",
          windowsVirtualKeyCode: 9,
        })
        await session.send("Input.dispatchKeyEvent", {
          type: "keyUp",
          key: "Tab",
          code: "Tab",
          windowsVirtualKeyCode: 9,
        })
        await audit.wait(
          `document.querySelector('#sched-prompt')?.value==='/compact '`,
          "command selection updated the actual prompt",
        )
        await capture(`editor-command-${theme}`)
        await audit.click("Cancel")
        await audit.wait("!document.querySelector('#sched-prompt')", "editor cancelled without a schedule")
      }
      await commandSelection("dark")
      // Keep catalogue fixture work inside the disposable renderer. Other requests retain their real adapters.
      await session.evaluate(`(() => {
      const originalFetch = window.fetch.bind(window)
      window.fetch = (input, options) => {
        const url = new URL(input instanceof Request ? input.url : String(input), location.href)
        if (url.pathname==='/api/config/skills/catalog') return Promise.resolve(Response.json({ok:true,sources:[
          {id:'custom:fixture',label:'Fixture catalog',source:'https://example.com/fixture.git'}]}))
        if (url.pathname==='/api/config/skills/catalog/source') return Promise.resolve(Response.json({ok:true,items:[]}))
        if (url.pathname==='/api/config/skills/scan') return Promise.resolve(Response.json({ok:true,items:[{skillName:'fixture'}]}))
        return originalFetch(input, options)
      }
      const settings = window.__AX_CODE_DESKTOP_RUNTIME_APIS__?.settings
      if (!settings) throw new Error('Missing registered settings adapter')
      window.__e2eOriginalSettingsLoad = settings.load.bind(settings)
      const originalSave = settings.save.bind(settings)
      window.__e2eCatalogWrites = 0
      settings.save = (changes) => {
        if (Object.hasOwn(changes, 'skillCatalogs')) window.__e2eCatalogWrites++
        return originalSave(changes)
      }
      return true
    })()`)
      await audit.click("Settings")
      await audit.page("Skills")
      await openCatalog()
      await audit.wait(
        `Array.from(document.querySelectorAll('button')).some(e=>e.textContent.trim()==='Add Catalog')`,
        "catalogue actions",
      )
      await audit.click("Add Catalog")
      await audit.wait(
        `Array.from(document.querySelectorAll('[role="dialog"]')).some(e=>e.textContent.includes('Add skills catalog'))`,
        "catalogue dialog",
      )
      await capture("catalog-valid-dark")
      await audit.click("Cancel")
      await session.evaluate(`(() => {
      window.__AX_CODE_DESKTOP_RUNTIME_APIS__.settings.load = async () => ({settings:{skillCatalogs:'invalid fixture'}})
      return true
    })()`)
      await audit.click("Add Catalog")
      await audit.fill("e.g. Team Skills", "Fixture addition")
      await audit.fill("owner/repo or git@github.com:owner/repo.git", "https://example.com/new.git")
      await audit.click("Scan")
      await audit.wait(`document.body.innerText.includes('Scan result: 1 skill(s) found')`, "controlled scan result")
      await audit.click("Add catalog")
      await audit.wait(`document.body.innerText.includes('Failed to save catalog')`, "malformed read refused")
      if (await session.evaluate("window.__e2eCatalogWrites !== 0"))
        throw new Error("Malformed catalogue read authorized a write")
      await capture("catalog-refused-dark")
      await audit.click("Cancel")
      await session.evaluate(
        `window.__AX_CODE_DESKTOP_RUNTIME_APIS__.settings.load = window.__e2eOriginalSettingsLoad; true`,
      )
      await audit.page("Appearance")
      await audit.click("Light")
      await audit.wait('document.documentElement.classList.contains("light")', "light theme")
      await audit.page("Skills")
      await openCatalog()
      await audit.click("Add Catalog")
      await audit.wait(
        `Array.from(document.querySelectorAll('[role="dialog"]')).some(e=>e.textContent.includes('Add skills catalog'))`,
        "light catalogue dialog",
      )
      await capture("catalog-valid-light")
      await audit.click("Cancel")
      await audit.click("Close settings")
      await commandSelection("light")
      const receipt = await (await fetch(`${origin}/__e2e__/scheduled-tasks`)).json()
      if (receipt.createAttempts || receipt.writes.length) throw new Error("Editor qualification created a schedule")
      return {
        name: "editor-catalog-boundaries",
        ok: true,
        detail:
          "Native command selection and catalogue refusal; zero catalogue/schedule writes, light/dark DOM/screenshots",
      }
    },
  ],
})
outcome.lines.forEach((line) => console.log(line))
process.exitCode = outcome.ok ? 0 : 1
