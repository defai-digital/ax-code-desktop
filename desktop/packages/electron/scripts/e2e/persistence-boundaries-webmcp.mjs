#!/usr/bin/env node
// Corrupt-storage startup qualification in a disposable profile; no model execution or permission approval.
import fs from "node:fs/promises"
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
    async function persistenceBoundaries({ session, e2e }) {
      const directory = e2e.scenario.projectDirectory
      await session.evaluate(`(async () => {
      const directory = ${JSON.stringify(directory)}
      const response = await fetch('/api/config/settings', {method:'PUT', headers:{'content-type':'application/json'},
        body:JSON.stringify({lastDirectory:directory})})
      if (!response.ok) throw new Error('Could not seed the disposable workspace')
      localStorage.setItem('lastDirectory', directory)
      const save = (key, version, state) => localStorage.setItem(key, JSON.stringify({version,state}))
      const stale = {__staleRestoreMarker:'not persisted data',loadProviders:'stale',initializeApp:'stale',
        loadAgents:'stale',loadCommands:'stale',loadSkills:'stale',loadMcpServers:'stale',loadPlugins:'stale',
        loadDefaultGitIdentityId:'stale',setTheme:'stale',setSettingsDialogOpen:'stale',getDrafts:'stale',getDraftCount:'stale'}
      save('ui-store',15,{...stale, activeMainTab:'git',isSidebarOpen:true,isSettingsDialogOpen:true,
        isSessionCreateDialogOpen:true,isSessionSwitcherOpen:true,sidebarWidth:'wide',favoriteModels:[null],
        notificationTemplates:{completion:null},browserPanel:{isOpen:true,url:'https://example.com/retired',focused:true}})
      save('config-store',1,{...stale,activeDirectoryKey:'/foreign',providers:[{}],modelsMetadata:{},
        directoryScoped:{'/bad':null,[directory]:{currentProviderId:'',currentModelId:'',providers:[{}],agents:['retired'],selectionSource:'manual'}}})
      for(const [key,field] of [['agents-store','selectedAgentName'],['commands-store','selectedCommandName'],
        ['skills-store','selectedSkillName'],['git-identities-store','selectedProfileId'],
        ['mcp-config-store','selectedMcpName'],['plugins-store','selectedId']]) save(key,0,{...stale,[field]:42})
      save('openchamber-inline-comment-drafts',2,{...stale,drafts:{draft:[null],bad:'malformed'}})
      save('ax-code-work-mode',0,{...stale,modeByDirectory:null,getMode:'stale'})
      save('session-display-mode',0,{...stale,displayMode:'future',showScheduledSection:'bad',scheduledRevealRequest:99,revealScheduledSection:'stale'})
      save('repository-hints',1,{...stale,dismissedChildren:{bad:42},dismissedParent:{bad:[]},dismissChildren:'stale'})
      save('permission-store',0,{...stale,autoAccept:{},defaultAutoAccept:false,isSessionAutoAccepting:'stale'})
      return true
    })()`)
      await session.send("Page.reload", { ignoreCache: true })
      await journeyBoot({ session })
      const audit = new SettingsWebMcpAudit(session)
      await audit.client.enable()
      await audit.wait(`!document.querySelector('[role="dialog"]')`, "transient dialogs remain closed")
      await audit.wait(
        `(() => {
      const state = window.__zustand_config_store__?.getState()
      return state && state.modelsMetadata instanceof Map && typeof state.loadProviders==='function'
        && typeof state.initializeApp==='function' && state.activeDirectoryKey===${JSON.stringify(directory)}
    })()`,
        "live Config actions and metadata ownership",
      )
      const capture = async (name) => {
        const inspection = await session.evaluate(`(() => {
        const config = window.__zustand_config_store__.getState()
        return {theme:document.documentElement.className,activeDirectoryKey:config.activeDirectoryKey,
          metadataIsMap:config.modelsMetadata instanceof Map,loadProvidersType:typeof config.loadProviders,
          savedUI:JSON.parse(localStorage.getItem('ui-store')||'{}').state,
          savedConfig:JSON.parse(localStorage.getItem('config-store')||'{}').state}
      })()`)
        if (!args.artifacts) return
        await fs.mkdir(args.artifacts, { recursive: true })
        await fs.writeFile(
          path.join(args.artifacts, `${name}.json`),
          JSON.stringify({ state: await audit.all(), inspection }, null, 2),
        )
        const { data } = await session.send("Page.captureScreenshot", { format: "png" })
        await fs.writeFile(path.join(args.artifacts, `${name}.png`), Buffer.from(data, "base64"))
      }
      await audit.click("Settings")
      for (const page of ["Appearance", "Agents", "Commands", "MCP", "Git", "Skills"]) await audit.page(page)
      await audit.page("Appearance")
      await audit.click("Dark")
      await audit.wait('document.documentElement.classList.contains("dark")', "dark preference")
      await capture("storage-restored-dark")
      await audit.click("Light")
      await audit.wait('document.documentElement.classList.contains("light")', "light preference")
      await capture("storage-restored-light")
      const clean = await session.evaluate(`(() => {
      const state = JSON.parse(localStorage.getItem('ui-store')||'{}').state
      const config = JSON.parse(localStorage.getItem('config-store')||'{}').state
      return state && !Object.hasOwn(state,'setTheme') && !Object.hasOwn(state,'activeMainTab')
        && !Object.hasOwn(state,'isSessionCreateDialogOpen') && !Object.hasOwn(state,'__staleRestoreMarker')
        && config && !Object.hasOwn(config,'loadProviders') && !Object.hasOwn(config,'modelsMetadata')
        && !Object.hasOwn(config,'activeDirectoryKey') && !Object.hasOwn(config,'providers')
        && Object.values(config.directoryScoped).every(snapshot=>snapshot.providers.length===0 && !Object.hasOwn(snapshot,'agents'))
    })()`)
      if (!clean) throw new Error("A live preference write retained stale executable/transient state")
      await audit.click("Close settings")
      await session.send("Page.reload", { ignoreCache: true })
      await journeyBoot({ session })
      await audit.client.enable()
      await audit.wait(
        `!document.querySelector('[role="dialog"]') && document.documentElement.classList.contains('light')`,
        "clean reload retains the chosen theme",
      )
      await capture("storage-restored-reload")
      return {
        name: "persistence-boundaries",
        ok: true,
        detail:
          "Malformed snapshots preserve live actions, metadata and window ownership; settings pages, light/dark and clean reload",
      }
    },
  ],
})
outcome.lines.forEach((line) => console.log(line))
process.exitCode = outcome.ok ? 0 : 1
