#!/usr/bin/env node
import fs from "node:fs/promises"
import path from "node:path"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { waitForCondition } from "./cdp.mjs"
import { journeyBoot } from "./journeys.mjs"
import { parseArgs, runHarness } from "./run.mjs"
import { SettingsWebMcpAudit } from "./settings-webmcp.mjs"
import { assertPathInsideDirectory } from "./scenario.mjs"

const exec = promisify(execFile)
const args = parseArgs(process.argv.slice(2))
const outcome = await runHarness({
  ...args, uiWebMcp: true, portfolio: true,
  journeys: [journeyBoot, async function supervisionWorkspace({ session, e2e }) {
    const audit = new SettingsWebMcpAudit(session)
    const targets = [e2e.scenario.session, e2e.scenario.portfolio[0].session]
    // Real git data, confined to the disposable harness projects. No runtime prompt is sent.
    for (const [index, target] of targets.entries()) {
      assertPathInsideDirectory(target.directory, path.dirname(e2e.stubOriginPath), "Fixture repository")
      await exec("git", ["init", "--quiet", target.directory])
      await fs.writeFile(path.join(target.directory, "review.txt"), `Original project ${index}\n`)
      await exec("git", ["-C", target.directory, "add", "review.txt"])
      await exec("git", ["-C", target.directory, "-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", "-c", "user.name=E2E", "-c", "user.email=e2e@example.invalid", "commit", "--quiet", "-m", "Seed review fixture"])
      await fs.writeFile(path.join(target.directory, "review.txt"), `Revised project ${index}\n`)
    }
    const origin = (await fs.readFile(e2e.stubOriginPath, "utf8")).trim()
    const armed = await fetch(`${origin}/__e2e__/step`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ step: "portfolio-goals" }),
    })
    if (!armed.ok) throw new Error("Could not arm portfolio fixture")
    await session.send("Page.reload", { ignoreCache: true })
    await journeyBoot({ session })
    await audit.client.enable()
    await audit.click("Settings")
    await audit.page("Chat")
    await audit.wait(`Boolean(document.querySelector('[aria-label="Diff layout: Dynamic"]'))`, "diff layout option rendered")
    await session.evaluate(`document.querySelector('[aria-label="Diff layout: Dynamic"]').scrollIntoView({ block: 'center' }); true`)
    await audit.click("Diff layout: Dynamic", { role: "radio" })
    await audit.wait(`document.querySelector('[aria-label="Diff layout: Dynamic"]')?.getAttribute('aria-checked') === 'true'`, "dynamic diff layout")
    await audit.click("Close settings")
    const capture = async name => {
      const state = await audit.all()
      const layout = await session.evaluate(`(() => {
        const visible = e => e.checkVisibility() && !e.closest('[aria-hidden="true"], [inert]')
        const roots = Array.from(document.querySelectorAll('[data-mission-control], [data-workspace-navigation], [data-review-changes]')).filter(visible)
        return roots.map(root => ({
          kind: root.hasAttribute('data-mission-control') ? 'board' : root.hasAttribute('data-review-changes') ? 'review' : 'navigation',
          width: root.clientWidth, scrollWidth: root.scrollWidth, text: root.innerText,
          controls: Array.from(root.querySelectorAll('button,input,select')).filter(visible).map(e => {
            const r=e.getBoundingClientRect(), p=root.getBoundingClientRect()
            return {name:e.getAttribute('aria-label') || e.innerText, left:r.left, right:r.right, outside:r.left<p.left-1 || r.right>p.right+1}
          })
        }))
      })()`)
      if (layout.some(root => root.scrollWidth > root.width + 1 || root.controls.some(control => control.outside))) {
        throw new Error(`${name}: controls overflow ${JSON.stringify(layout)}`)
      }
      if (args.artifacts) {
        await fs.mkdir(args.artifacts, { recursive: true })
        await fs.writeFile(path.join(args.artifacts, `${name}.json`), JSON.stringify({ state, layout }, null, 2))
        const { data } = await session.send("Page.captureScreenshot", { format: "png" })
        await fs.writeFile(path.join(args.artifacts, `${name}.png`), Buffer.from(data, "base64"))
      }
    }
    const viewport = width => session.send("Emulation.setDeviceMetricsOverride", { width, height: 1000, deviceScaleFactor: 1, mobile: false })
    const openBoard = async () => {
      await audit.click("Mission Control", { role: "button" })
      await audit.wait('document.querySelectorAll(".mission-control-row").length === 2', "two board rows")
    }
    const rowAction = async (prefix, target) => {
      const matches = (await audit.all()).controls.filter(control => control.name.startsWith(prefix) && control.name.includes(target.directory))
      if (matches.length !== 1) throw new Error(`Expected one ${prefix} action for ${target.directory}; got ${matches.length}`)
      await audit.click(matches[0].name)
    }
    const reviewDirectory = target => audit.wait(`document.querySelector('[data-review-directory]')?.textContent === ${JSON.stringify(target.directory)}`, "review directory")
    const diffText = `Array.from(document.querySelectorAll('diffs-container')).map(e=>e.shadowRoot?.textContent || '').join(' ')`
    const checkDiff = async index => {
      await audit.wait(`${diffText}.includes(${JSON.stringify(`Revised project ${index}`)})`, "rendered fixture diff")
      if (await session.evaluate(`${diffText}.includes(${JSON.stringify(`Revised project ${1-index}`)})`)) throw new Error("Other project's diff leaked")
    }
    // Select the fixture project through its observed session action, then open a fresh draft.
    await openBoard()
    await rowAction("Open —", targets[0])
    await audit.wait(`document.querySelector('[data-workspace-directory]')?.textContent === ${JSON.stringify(targets[0].directory)}`, "selected project")
    const newSessionName = await session.evaluate(String.raw`document.querySelector('[data-sidebar-new-session]')?.textContent.replace(/\s+/g,' ').trim()`)
    await audit.click(newSessionName)
    await audit.wait('Boolean(document.querySelector("[data-draft-home]"))', "new session draft")
    // Review works in the draft without creating a runtime session.
    await audit.click("Review changes", { role: "button" })
    await reviewDirectory(targets[0])
    await checkDiff(0)
    await capture("draft-review")
    await audit.click("Workspace", { role: "button" })
    await audit.wait('!document.querySelector("[data-review-changes]")', "review closed")
    await openBoard()
    await audit.fill("Search sessions or projects…", "other-project")
    await audit.wait('document.querySelectorAll(".mission-control-row").length === 1', "path search")
    await capture("search-by-path")
    await audit.fill("Search sessions or projects…", "zzzz-no-match")
    await audit.wait('document.body.innerText.includes("No sessions match these filters")', "no-match state")
    await audit.click("2 need you outside this view")
    await audit.wait('document.querySelectorAll(".mission-control-row").length === 2', "hidden attention recovery")
    await audit.click("Running (0)")
    await audit.wait('document.querySelectorAll(".mission-control-row").length === 0', "status filter")
    await audit.click("2 need you outside this view")
    for (const target of targets) {
      await rowAction("Details —", target)
      await audit.wait(`document.querySelector('#mission-details-${target.id}') !== null`, "details expanded")
      await capture(`details-${target.id}`)
      await rowAction("Details —", target)
      await rowAction("Open —", target)
      const index = targets.indexOf(target)
      await audit.wait(`document.body.innerText.includes(${JSON.stringify(`Fixture conversation for project ${index === 0 ? "A" : "B"}`)})`, "correct conversation")
      await audit.wait(`document.querySelector('[data-workspace-directory]')?.textContent === ${JSON.stringify(target.directory)}`, "workspace context")
      await audit.click("Review changes", { role: "button" })
      await reviewDirectory(target)
      await checkDiff(index)
      await capture(`review-${target.id}`)
      await audit.click("Workspace", { role: "button" })
      await openBoard()
    }
    for (const theme of ["dark", "light"]) {
      await viewport(1280)
      if (theme === "light") {
        await waitForCondition(async () => Boolean(await audit.find("Settings", { role: "button", optional: true })), { timeoutMs: 10000, label: "Settings after responsive sidebar restoration" })
        await audit.click("Settings")
        await audit.page("Appearance")
        await audit.click("Light")
        await audit.wait('document.documentElement.classList.contains("light")', "light theme")
        await audit.click("Close settings")
      }
      for (const width of [1280, 1024, 800, 600]) {
        await viewport(width)
        await capture(`board-${theme}-${width}`)
      }
      await rowAction("Open —", targets[0])
      await audit.wait('Boolean(document.querySelector("[data-chat-input]"))', "chat composer")
      const composerName = await session.evaluate(`(() => { const e=document.querySelector('[data-chat-input]'); return e.getAttribute('aria-label') || e.getAttribute('placeholder') })()`)
      await audit.fill(composerName, "Preserve this unsent review draft")
      await audit.wait(`document.querySelector('[data-chat-input]')?.value === 'Preserve this unsent review draft'`, "draft entered")
      await audit.click("Review changes", { role: "button" })
      await reviewDirectory(targets[0])
      await checkDiff(0)
      await session.evaluate("window.__reviewChatNode = document.querySelector('[data-split-chat]'); true")
      for (const width of [2800, 1600, 1280, 1024, 800, 600]) {
        await viewport(width)
        await audit.wait(`Math.abs(Number(document.querySelector('[data-review-changes]')?.dataset.reviewWidth) - document.querySelector('[data-review-changes]').getBoundingClientRect().width) < 2`, "pane measurement")
        if (!(await session.evaluate("window.__reviewChatNode === document.querySelector('[data-split-chat]')"))) throw new Error("Chat remounted during resize")
        if (width <= 800) {
          await audit.wait(`getComputedStyle(document.querySelector('[data-split-chat]')).display === 'none'`, "narrow review focus")
        }
        await audit.wait(`(() => {
          const paneWidth = Number(document.querySelector('[data-review-changes]').dataset.reviewWidth)
          const expected = paneWidth >= 1100 ? 'split' : 'single'
          const rendered = Array.from(document.querySelectorAll('diffs-container')).map(e => e.shadowRoot?.querySelector('pre[data-diff-type]')).filter(Boolean)
          return rendered.length > 0 && rendered.every(e => e.getAttribute('data-diff-type') === expected)
        })()`, "dynamic layout follows pane width")
        await capture(`review-${theme}-${width}`)
      }
      await audit.click("Workspace", { role: "button" })
      await audit.wait('document.body.innerText.includes("Fixture conversation for project A") && !document.querySelector("[data-review-changes]")', "return to chat")
      await audit.wait(`document.querySelector('[data-chat-input]')?.value === 'Preserve this unsent review draft'`, "unsent draft survives review")
      await openBoard()
    }
    if (args.artifacts) await fs.writeFile(path.join(args.artifacts, "receipt.json"), JSON.stringify({ targets, calls: audit.calls }, null, 2))
    return { name: "supervision-workspace", ok: true, detail: "Native WebMCP search/status/disclosure, draft review, two real fixture repositories, pane resizing and dark/light layouts" }
  }],
})
for (const line of outcome.lines) console.log(line)
process.exitCode = outcome.ok ? 0 : 1
