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
      const plainDirectory = e2e.scenario.session.directory
      const directory = `${plainDirectory} `
      assertPathInsideDirectory(directory, path.dirname(e2e.stubOriginPath), "Context-panel fixture directory")
      const names = ["report.txt", "report.txt "]
      const markers = ["PLAIN TARGET", "LITERAL SPACED TARGET"]
      await fs.mkdir(directory, { recursive: true })
      await fs.mkdir(plainDirectory, { recursive: true })
      await fs.writeFile(path.join(plainDirectory, "report.txt "), "WRONG SIBLING TARGET\n")
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
      const projects = [${JSON.stringify(plainDirectory)}, directory].map(path => ({
        id: 'path_' + btoa(path).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, ''), path
      }))
      const response = await fetch('/api/config/settings', {
        method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({lastDirectory:directory,projects,activeProjectId:projects[1].id})
      })
      if (!response.ok) throw new Error('Could not seed the fixture workspace preference')
      localStorage.setItem('lastDirectory', directory)
      localStorage.setItem('projects', JSON.stringify(projects))
      localStorage.setItem('activeProjectId', projects[1].id)
      localStorage.setItem('files-view-tabs-store', JSON.stringify({version:2,state:{
        setSelectedPath:'legacy persisted value', byRoot:{[directory]:{
          openPaths:[${JSON.stringify(tabs[0].targetPath)}, 42, '/outside/file.txt'],
          selectedPath:${JSON.stringify(tabs[1].targetPath)}, expandedPaths:[directory, '/outside'], touchedAt:1
        }}
      }}))
      const saved = JSON.parse(localStorage.getItem('ui-store') || '{}')
      localStorage.setItem('ui-store', JSON.stringify({version:15,state:{...saved.state,
        activeMainTab:'chat', isSidebarOpen:true, splitPaneEnabled:false,
        contextPanelByDirectory:{[${JSON.stringify(directory)}]:{
          tabs:${JSON.stringify(tabs)},activeTabId:${JSON.stringify(tabs[0].id)},isOpen:true,expanded:false,width:640,touchedAt:1
        }}
      }})); return true
    })()`)
      await session.send("Page.reload", { ignoreCache: true })
      await journeyBoot({ session })
      const audit = new SettingsWebMcpAudit(session)
      await audit.client.enable()
      await audit.wait(`(() => {
        const projects = JSON.parse(localStorage.getItem('projects') || '[]')
        return projects.length===2 && projects[0].id!==projects[1].id
          && projects.some(p=>p.path===${JSON.stringify(directory)})
          && localStorage.getItem('lastDirectory')===${JSON.stringify(directory)}
      })()`, "distinct literal project roots after hydration")
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

      await audit.wait(`(() => {
        const files = JSON.parse(localStorage.getItem('files-view-tabs-store') || '{}').state
        const root = files?.byRoot[${JSON.stringify(directory)}]
        return root?.openPaths.length===2 && root.openPaths.includes(${JSON.stringify(tabs[0].targetPath)})
          && root.openPaths.includes(${JSON.stringify(tabs[1].targetPath)})
          && root.selectedPath===${JSON.stringify(tabs[1].targetPath)}
          && root.expandedPaths.length===1 && root.expandedPaths[0]===${JSON.stringify(directory)}
          && !Object.hasOwn(files, 'setSelectedPath')
      })()`, "validated Files restore and live selection")

      const capture = async (name) => {
        const state = await audit.all()
        const inspection = await session.evaluate(`({
        tabs:Array.from(document.querySelectorAll('[data-context-panel] [role="tab"]')).map(e=>({title:e.title,selected:e.getAttribute('aria-selected')})),
        content:${visibleContent}, theme:document.documentElement.className,
        persisted:JSON.parse(localStorage.getItem('ui-store') || '{}').state?.contextPanelByDirectory,
        filesPersisted:JSON.parse(localStorage.getItem('files-view-tabs-store') || '{}').state
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
        detail: "Validated distinct literal project roots, Files restore, file selection, close and reload; light/dark DOM/screenshots",
      }
    },
  ],
})
outcome.lines.forEach((line) => console.log(line))
process.exitCode = outcome.ok ? 0 : 1
