#!/usr/bin/env node
// Isolated POSIX filename/restore journey. Native WebMCP drives the real tab handlers.
import fs from "node:fs/promises"
import path from "node:path"
import { assertPathInsideDirectory } from "./scenario.mjs"
import { journeyBoot } from "./journeys.mjs"
import { parseArgs, runHarness } from "./run.mjs"
import { SettingsWebMcpAudit } from "./settings-webmcp.mjs"

const args = parseArgs(process.argv.slice(2))
const outcome = await runHarness({
  ...args,
  uiWebMcp: true,
  journeys: [
    journeyBoot,
    async function contextPanelState({ session, e2e }) {
      if (process.platform === "win32") throw new Error("This journey requires POSIX trailing-space filenames")
      const directory = e2e.scenario.session.directory
      assertPathInsideDirectory(directory, path.dirname(e2e.stubOriginPath), "Context-panel fixture directory")
      const names = ["report.txt", "report.txt "]
      const markers = ["PLAIN TARGET", "LITERAL SPACED TARGET"]
      await fs.mkdir(directory, { recursive: true })
      for (const [index, name] of names.entries()) await fs.writeFile(path.join(directory, name), markers[index] + "\n")
      const tabs = names.map((name, index) => ({
        id: `file:${path.join(directory, name)}`,
        mode: "file",
        targetPath: path.join(directory, name),
        dedupeKey: path.join(directory, name),
        label: null,
        readOnly: false,
        stagedDiff: false,
        touchedAt: index + 1,
      }))
      await session.evaluate(`(async () => {
      const directory = ${JSON.stringify(directory)}
      const response = await fetch('/api/config/settings', {
        method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({lastDirectory:directory})
      })
      if (!response.ok) throw new Error('Could not seed the fixture workspace preference')
      localStorage.setItem('lastDirectory', directory)
      const saved = JSON.parse(localStorage.getItem('ui-store') || '{}')
      localStorage.setItem('ui-store', JSON.stringify({version:15,state:{...saved.state,
        activeMainTab:'chat', isRightSidebarOpen:false, isSidebarOpen:true, splitPaneEnabled:false,
        contextPanelByDirectory:{[${JSON.stringify(directory)}]:{
          tabs:${JSON.stringify(tabs)},activeTabId:${JSON.stringify(tabs[0].id)},isOpen:true,expanded:false,width:640,touchedAt:1
        }}
      }})); return true
    })()`)
      await session.send("Page.reload", { ignoreCache: true })
      await journeyBoot({ session })
      const audit = new SettingsWebMcpAudit(session)
      await audit.client.enable()
      const selectedTitle = `document.querySelector('[data-context-panel] [role="tab"][aria-selected="true"]')?.title`
      const visibleContent = `Array.from(document.querySelectorAll('[data-context-panel] .cm-content')).filter(e=>e.checkVisibility()).map(e=>e.textContent).join(' ')`
      await audit.wait(
        `document.querySelectorAll('[data-context-panel] [role="tab"]').length===2`,
        "two literal file tabs",
      )
      await audit.click("report.txt", { role: "tab", index: 1 })
      await audit.wait(
        `${selectedTitle}?.endsWith('report.txt ') && ${visibleContent}.includes('LITERAL SPACED TARGET')`,
        "spaced file content",
      )

      const capture = async (name) => {
        const state = await audit.all()
        const inspection = await session.evaluate(`({
        tabs:Array.from(document.querySelectorAll('[data-context-panel] [role="tab"]')).map(e=>({title:e.title,selected:e.getAttribute('aria-selected')})),
        content:${visibleContent}, theme:document.documentElement.className,
        persisted:JSON.parse(localStorage.getItem('ui-store') || '{}').state?.contextPanelByDirectory
      })`)
        if (args.artifacts) {
          await fs.mkdir(args.artifacts, { recursive: true })
          await fs.writeFile(path.join(args.artifacts, name + ".json"), JSON.stringify({ state, inspection }, null, 2))
          const { data } = await session.send("Page.captureScreenshot", { format: "png" })
          await fs.writeFile(path.join(args.artifacts, name + ".png"), Buffer.from(data, "base64"))
        }
      }
      await capture("context-files-dark")
      await audit.click("Settings")
      await audit.page("Appearance")
      await audit.click("Light")
      await audit.wait('document.documentElement.classList.contains("light")', "light theme")
      await audit.click("Close settings")
      await audit.wait(
        `${selectedTitle}?.endsWith('report.txt ') && ${visibleContent}.includes('LITERAL SPACED TARGET')`,
        "retained spaced file",
      )
      await capture("context-files-light")
      await audit.click("Close report.txt tab", { role: "button", index: 1 })
      await audit.wait(
        `document.querySelectorAll('[data-context-panel] [role="tab"]').length===1 && ${visibleContent}.includes('PLAIN TARGET')`,
        "only the plain file remains",
      )
      await session.send("Page.reload", { ignoreCache: true })
      await journeyBoot({ session })
      await audit.client.enable()
      await audit.wait(
        `document.querySelectorAll('[data-context-panel] [role="tab"]').length===1 && ${visibleContent}.includes('PLAIN TARGET')`,
        "closed tab stays closed after reload",
      )
      await capture("context-files-restored")
      return {
        name: "context-panel-state",
        ok: true,
        detail: "Literal file selection, close and restore; light/dark DOM/screenshots",
      }
    },
  ],
})
outcome.lines.forEach((line) => console.log(line))
process.exitCode = outcome.ok ? 0 : 1
