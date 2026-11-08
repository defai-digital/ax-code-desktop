#!/usr/bin/env node
// Isolated native layout journeys. No provider execution or real project writes.
import fs from "node:fs/promises"
import path from "node:path"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { assertPathInsideDirectory } from "./scenario.mjs"
import { journeyBoot } from "./journeys.mjs"
import { parseArgs, runHarness } from "./run.mjs"
import { SettingsWebMcpAudit } from "./settings-webmcp.mjs"
import { setDesktopViewport, waitForCollapsedDesktopSidebar } from "./desktop-viewport.mjs"

const args = parseArgs(process.argv.slice(2))
const outcome = await runHarness({
  ...args,
  uiWebMcp: true,
  portfolio: true,
  journeys: [
    journeyBoot,
    async function workspaceUx({ session, e2e }) {
      const exec = promisify(execFile)
      const directory = e2e.scenario.session.directory
      assertPathInsideDirectory(directory, path.dirname(e2e.stubOriginPath), "UX fixture repository")
      await exec("git", ["init", "--quiet", directory])
      await fs.writeFile(path.join(directory, "layout.txt"), "Original layout fixture\n")
      await exec("git", ["-C", directory, "add", "--", "layout.txt"])
      await exec("git", [
        "-C",
        directory,
        "-c",
        "core.hooksPath=/dev/null",
        "-c",
        "commit.gpgsign=false",
        "-c",
        "user.name=E2E",
        "-c",
        "user.email=e2e@example.invalid",
        "commit",
        "--quiet",
        "-m",
        "Seed workspace layout fixture",
      ])
      await fs.writeFile(path.join(directory, "layout.txt"), "Improved layout fixture\n")
      const origin = (await fs.readFile(e2e.stubOriginPath, "utf8")).trim()
      const response = await fetch(`${origin}/__e2e__/step`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ step: "portfolio-goals" }),
      })
      if (!response.ok) throw new Error("Could not prepare portfolio fixture")
      await session.send("Page.reload", { ignoreCache: true })
      await journeyBoot({ session })
      const audit = new SettingsWebMcpAudit(session)
      await audit.client.enable()
      const visible = (selector) =>
        `Array.from(document.querySelectorAll(${JSON.stringify(selector)})).some(e => e.checkVisibility({ opacityProperty: true }) && !e.closest('[aria-hidden="true"], [inert], [data-ending-style]'))`
      const capture = async (name) => {
        const state = await audit.all()
        const layout = await session.evaluate(`(() => {
        const visible = e => e.checkVisibility({ opacityProperty: true }) && !e.closest('[aria-hidden="true"], [inert], [data-ending-style]')
        return { width:innerWidth, height:innerHeight,
          panes:Array.from(document.querySelectorAll('[data-split-chat],[data-split-inspector],aside,[data-inspector-rail]')).filter(visible).map(e=>{
            const r=e.getBoundingClientRect();return {kind:e.hasAttribute('data-split-inspector')?'inspector':e.hasAttribute('data-split-chat')?'chat':e.tagName.toLowerCase(),width:r.width,left:r.left,right:r.right}
          }),
          projects:Array.from(document.querySelectorAll('[data-project-row]')).map(e=>({name:e.getAttribute('aria-label'),text:e.innerText})),
          liveContext:Array.from(document.querySelectorAll('[data-session-project-context]')).filter(visible).map(e=>e.innerText),
          starters:Array.from(document.querySelectorAll('[data-starter-layout]')).filter(visible).map(e=>e.innerText)
        }
      })()`)
        if (layout.panes.some((pane) => pane.right > layout.width + 1 || pane.left < -1))
          throw new Error(`${name}: pane overflows`)
        if (args.artifacts) {
          await fs.mkdir(args.artifacts, { recursive: true })
          await fs.writeFile(path.join(args.artifacts, `${name}.json`), JSON.stringify({ state, layout }, null, 2))
          const { data } = await session.send("Page.captureScreenshot", { format: "png" })
          await fs.writeFile(path.join(args.artifacts, `${name}.png`), Buffer.from(data, "base64"))
        }
        return layout
      }
      const viewport = async (width) => {
        await setDesktopViewport(session, { width, height: 800 })
        if (width === 800) await waitForCollapsedDesktopSidebar(session)
      }
      await viewport(1280)
      await audit.wait(`matchMedia('(prefers-reduced-motion: reduce)').matches &&
        Array.from(document.querySelectorAll('aside[aria-hidden]')).every(e => getComputedStyle(e).transitionProperty === 'none')`, "panels respect reduced motion")
      await audit.wait('document.querySelectorAll("[data-needs-you-reason]").length === 2', "two decisions")
      await audit.wait(
        `(() => {
      const projects=document.querySelector('[data-projects-home-header]')
      const starter=document.querySelector('[data-starter-grid]')
      return projects && starter && projects.getBoundingClientRect().top < innerHeight &&
        Boolean(projects.compareDocumentPosition(starter) & Node.DOCUMENT_POSITION_FOLLOWING) &&
        document.querySelectorAll('[data-starter-layout]').length===3
    })()`,
        "projects before three bounded suggestions in the first viewport",
      )
      await capture("home-dark-1280")
      await audit.click("Show more", { role: "button" })
      await audit.wait('document.querySelectorAll("[data-starter-layout]").length > 3', "all starter actions")
      await audit.click("Show less", { role: "button" })
      await audit.wait('document.querySelectorAll("[data-starter-layout]").length === 3', "collapsed suggestions")
      await audit.fill("Message input", "Keep this unsent layout-review draft")
      await session.evaluate(
        `window.__uxDraftNode = document.querySelector('textarea[aria-label="Message input"]'); true`,
      )
      const checkDraft = () =>
        audit.wait(
          `window.__uxDraftNode === document.querySelector('textarea[aria-label="Message input"]') && window.__uxDraftNode?.value === 'Keep this unsent layout-review draft'`,
          "same composer and unsent draft",
        )
      await checkDraft()
      await audit.click("Files", { role: "button" })
      await audit.wait(visible("[data-split-inspector]"), "Files inspector")
      await audit.wait(
        'getComputedStyle(document.querySelector("[data-split-chat]")).display === "none"',
        "Files receives a usable editor width",
      )
      await capture("files-dark-1280")
      await audit.click("Toggle right sidebar")
      await audit.wait(
        `!(${visible("[data-split-inspector]")}) && ${visible("[data-split-chat]")}`,
        "sidebar suspends inspector",
      )
      await checkDraft()
      await capture("sidebar-handoff-dark-1280")
      await audit.click("Files", { role: "button" })
      await audit.wait(
        `${visible("[data-split-inspector]")} && !document.querySelector('aside:last-child[aria-hidden="false"]')`,
        "tool restores inspector without competing sidebar",
      )
      await checkDraft()
      await audit.click("Back to conversation")
      await audit.wait(`!(${visible("[data-split-inspector]")})`, "return from Files")
      await checkDraft()
      await viewport(1600)
      await audit.click("Review changes", { role: "button" })
      await audit.wait(visible("[data-split-inspector]"), "review inspector")
      await audit.click("Focus panel")
      await audit.wait(
        'document.querySelector("[data-panel-focused=true]") && getComputedStyle(document.querySelector("[data-split-chat]")).display === "none"',
        "focused review",
      )
      await checkDraft()
      await audit.wait(`Array.from(document.querySelectorAll('[data-review-changes] diffs-container')).some(host =>
        host.checkVisibility() && host.shadowRoot?.querySelector('pre')?.textContent?.includes('Improved')) ||
        document.querySelector('[data-review-changes]')?.innerText.includes('Improved layout fixture')`, "populated review content")
      await capture("review-focused-dark-1600")
      await audit.click("Restore split view")
      await audit.wait(
        'getComputedStyle(document.querySelector("[data-split-chat]")).display !== "none"',
        "split restored",
      )
      await audit.click("Back to conversation")
      await checkDraft()
      await audit.click("Session views")
      await audit.click("Session grid", { role: "menuitem" })
      await audit.wait(visible("[data-session-grid]"), "grid via view selector")
      await audit.click("Workspace", { role: "button" })
      await checkDraft()
      await audit.click("Portfolio", { role: "button" })
      await audit.wait('document.querySelectorAll(".mission-control-row").length === 2', "existing portfolio board")
      await viewport(1280)
      await capture("portfolio-dark-1280")
      await audit.click("Settings")
      await audit.page("Appearance")
      await audit.click("Light")
      await audit.wait('document.documentElement.classList.contains("light")', "light theme")
      await audit.click("Close settings")
      await audit.wait(`!(${visible("[data-settings-view]")})`, "settings visually closed")
      await capture("portfolio-light-1280")
      await viewport(800)
      await capture("portfolio-light-800")
      await audit.click("Workspace", { role: "button" })
      await audit.click("Files", { role: "button" })
      await audit.wait(
        'getComputedStyle(document.querySelector("[data-split-chat]")).display === "none"',
        "single inspector at 800",
      )
      const narrow = await capture("files-light-800")
      if (narrow.panes.filter((pane) => pane.kind === "inspector").some((pane) => pane.width < 700))
        throw new Error("Narrow inspector must have the workspace width")
      await audit.click("Back to conversation")
      await checkDraft()
      await capture("draft-return-light-800")
      return {
        name: "workspace-ux",
        ok: true,
        detail:
          "Projects precede bounded suggestions; panel handoffs, focus, views and themes preserve the same unsent draft",
      }
    },
  ],
})
for (const line of outcome.lines) console.log(line)
process.exitCode = outcome.ok ? 0 : 1
