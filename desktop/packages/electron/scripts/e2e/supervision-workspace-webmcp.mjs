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
    const committedFiles = ["review.txt", "docs/guide.txt", "src/feature.txt", "docs/obsolete.txt"]
    const changedFiles = [...committedFiles, "src/untracked.txt"].sort()
    // Real git data, confined to the disposable harness projects. No runtime prompt is sent.
    for (const [index, target] of targets.entries()) {
      assertPathInsideDirectory(target.directory, path.dirname(e2e.stubOriginPath), "Fixture repository")
      await exec("git", ["init", "--quiet", target.directory])
      for (const file of committedFiles) {
        await fs.mkdir(path.dirname(path.join(target.directory, file)), { recursive: true })
        await fs.writeFile(path.join(target.directory, file), `Original project ${index}: ${file}\n`)
      }
      await exec("git", ["-C", target.directory, "add", "--", ...committedFiles])
      await exec("git", ["-C", target.directory, "-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", "-c", "user.name=E2E", "-c", "user.email=e2e@example.invalid", "commit", "--quiet", "-m", "Seed review fixture"])
      for (const file of committedFiles.slice(0, 3)) {
        await fs.writeFile(path.join(target.directory, file), `Revised project ${index}: ${file}\n`)
      }
      await fs.unlink(path.join(target.directory, "docs/obsolete.txt"))
      await fs.writeFile(path.join(target.directory, "src/untracked.txt"), `Untracked project ${index}: src/untracked.txt\n`)
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
          groups: Array.from(root.querySelectorAll('[role="rowgroup"]')).map(e => ({ name:e.getAttribute('aria-label'), rows:Array.from(e.querySelectorAll('.mission-control-row')).map(row=>row.id) })),
          files: Array.from(root.querySelectorAll('[data-review-file]')).map(e => ({ path:e.dataset.reviewFile, current:e.getAttribute('aria-current'), viewed:e.querySelector('input[type="checkbox"]')?.checked })),
          progress: root.querySelector('[role="progressbar"]')?.getAttribute('aria-label'),
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
    const observedControl = async (name, role = "button") => {
      const matches = (await audit.all()).controls.filter(control => control.name === name && control.role === role)
      if (matches.length !== 1) throw new Error(`Expected one observed ${role}: ${name}; got ${matches.length}`)
      return matches[0].name
    }
    const checkComposerClearance = () => audit.wait(String.raw`(() => {
      const composer = document.querySelector('[data-chat-input]')
      const clearance = getComputedStyle(document.documentElement).getPropertyValue('--toast-composer-clearance').trim()
      return composer?.checkVisibility() && /^\d+(?:\.\d+)?px$/.test(clearance) && parseFloat(clearance) > 0
    })()`, "visible composer has positive toast clearance")
    const openBoard = async () => {
      await audit.click("Mission Control", { role: "button" })
      await audit.wait('document.querySelectorAll(".mission-control-row").length === 2', "two board rows")
    }
    const checkGroupedBoard = async () => {
      const groupName = await observedControl("Group by project")
      const grouped = pressed => `(() => {
        const board = document.querySelector('[data-mission-control]')
        const toggle = Array.from(board.querySelectorAll('button')).find(e => e.textContent.trim() === ${JSON.stringify(groupName)})
        return toggle?.getAttribute('aria-pressed') === '${pressed}' && board.querySelectorAll('[role="rowgroup"]').length === ${pressed ? 2 : 0} && board.querySelectorAll('.mission-control-row').length === 2
      })()`
      await audit.wait(grouped(true), "default project grouping with two session rows")
      const groups = await session.evaluate(`Array.from(document.querySelectorAll('[data-mission-control] [role="rowgroup"]')).map(e => ({
        name:e.getAttribute('aria-label'), collapse:e.querySelector('button[aria-expanded="true"]')?.getAttribute('aria-label'),
        rows:Array.from(e.querySelectorAll('.mission-control-row')).map(row=>row.id)
      }))`)
      if (groups.some(group => group.rows.length !== 1)) throw new Error("Expected one session in each project group")
      const collapseName = await observedControl(groups[0].collapse)
      if (!collapseName.startsWith("Collapse ")) throw new Error(`Unexpected collapse control: ${collapseName}`)
      await audit.click(collapseName)
      await audit.wait(`(() => {
        const groups = Array.from(document.querySelectorAll('[data-mission-control] [role="rowgroup"]'))
        return groups.length === 2 && groups[0].getAttribute('aria-label') === ${JSON.stringify(groups[0].name)} &&
          groups[0].querySelectorAll('.mission-control-row').length === 0 &&
          groups[0].querySelector('button[aria-expanded="false"]') !== null &&
          JSON.stringify(Array.from(document.querySelectorAll('.mission-control-row')).map(e=>e.id)) === ${JSON.stringify(JSON.stringify(groups[1].rows))}
      })()`, "first project collapsed and other project's row preserved")
      const expandLabel = await session.evaluate(`document.querySelector('[data-mission-control] [role="rowgroup"] button[aria-expanded="false"]')?.getAttribute('aria-label')`)
      const expandName = await observedControl(expandLabel)
      if (!expandName.startsWith("Expand ")) throw new Error(`Unexpected expand control: ${expandName}`)
      await audit.click(expandName)
      await audit.wait(grouped(true), "project group expanded")
      await audit.wait(`JSON.stringify(Array.from(document.querySelectorAll('.mission-control-row')).map(e=>e.id)) === ${JSON.stringify(JSON.stringify(groups.flatMap(group => group.rows)))}`, "both project rows restored")
      await audit.click(await observedControl(groupName))
      await audit.wait(grouped(false), "flat board retains two rows without rowgroups")
      await audit.click(await observedControl(groupName))
      await audit.wait(grouped(true), "project grouping restored")
    }
    const rowAction = async (prefix, target) => {
      const matches = (await audit.all()).controls.filter(control => control.name.startsWith(prefix) && control.name.includes(target.directory))
      if (matches.length !== 1) throw new Error(`Expected one ${prefix} action for ${target.directory}; got ${matches.length}`)
      await audit.click(matches[0].name)
    }
    const reviewDirectory = target => audit.wait(`document.querySelector('[data-review-directory]')?.getAttribute('data-review-directory') === ${JSON.stringify(target.directory)}`, "review directory")
    const diffText = `Array.from(document.querySelectorAll('diffs-container')).map(e=>e.shadowRoot?.textContent || '').join(' ')`
    const checkDiff = async index => {
      await audit.wait(`${diffText}.includes(${JSON.stringify(`Revised project ${index}`)})`, "rendered fixture diff")
      if (await session.evaluate(`${diffText}.includes(${JSON.stringify(`project ${1-index}:`)})`)) throw new Error("Other project's diff leaked")
    }
    const reviewKey = async key => {
      await session.send("Input.dispatchKeyEvent", { type: "keyDown", key, code: key === "]" ? "BracketRight" : "BracketLeft", windowsVirtualKeyCode: key === "]" ? 221 : 219 })
      await session.send("Input.dispatchKeyEvent", { type: "keyUp", key, code: key === "]" ? "BracketRight" : "BracketLeft", windowsVirtualKeyCode: key === "]" ? 221 : 219 })
    }
    const checkReviewRail = async name => {
      const paneWidth = await session.evaluate(`document.querySelector('[data-review-changes]').getBoundingClientRect().width`)
      if (paneWidth < 640) {
        await audit.wait(`!document.querySelector('[data-review-changes] .review-file-rail') && !document.querySelector('[data-review-changes] [data-review-file]')`, "narrow review has no file rail")
        await capture(name)
        return
      }
      await audit.wait(`JSON.stringify(Array.from(document.querySelectorAll('[data-review-changes] [data-review-file]')).map(e=>e.dataset.reviewFile).sort()) === ${JSON.stringify(JSON.stringify(changedFiles))}`, "one rail row for each of five changed files")
      const progress = count => `(() => {
        const rail = document.querySelector('[data-review-changes] .review-file-rail')
        const bar = rail?.querySelector('[role="progressbar"]')
        return bar?.getAttribute('aria-valuenow') === '${count}' && bar.getAttribute('aria-valuemax') === '5' &&
          bar.getAttribute('aria-label') === '${count} of 5 viewed' && rail.querySelector('.review-file-rail__count')?.textContent === '${count} of 5 viewed'
      })()`
      await audit.wait(progress(0), "review progress starts at 0 of 5")
      const markLabel = await session.evaluate(`document.querySelector('[data-review-changes] [data-review-file] input[type="checkbox"]')?.getAttribute('aria-label')`)
      // UI WebMCP reports native inputs by tag name.
      const markName = await observedControl(markLabel, "input")
      if (!markName.startsWith("Mark ") || !markName.endsWith(" as viewed")) throw new Error(`Unexpected viewed control: ${markName}`)
      await audit.click(markName, { role: "input" })
      await audit.wait(progress(1), "review progress changes to 1 of 5")
      const selection = await session.evaluate(`(() => {
        const rows = Array.from(document.querySelectorAll('[data-review-changes] [data-review-file]'))
        const index = rows.findIndex(e => e.getAttribute('aria-current') === 'true')
        if (index < 0 || !rows[index + 1]) throw new Error('Expected a selected file with a next file')
        rows[index].querySelector('button').focus({ preventScroll:true })
        return { current:rows[index].dataset.reviewFile, next:rows[index + 1].dataset.reviewFile }
      })()`)
      await audit.wait(`document.querySelector('[data-review-changes]')?.contains(document.activeElement) && document.activeElement?.matches('button') && !document.activeElement.isContentEditable`, "review keyboard focus is on a non-editable control")
      const selected = file => `JSON.stringify(Array.from(document.querySelectorAll('[data-review-changes] [data-review-file][aria-current="true"]')).map(e=>e.dataset.reviewFile)) === ${JSON.stringify(JSON.stringify([file]))}`
      await reviewKey("]")
      await audit.wait(selected(selection.next), "right bracket selects the next review file")
      await capture(name)
      // Restore progress and selection so every theme/width exercises the same transition.
      await reviewKey("[")
      await audit.wait(selected(selection.current), "review selection restored")
      await audit.click(await observedControl(markName, "input"), { role: "input" })
      await audit.wait(progress(0), "review progress restored")
    }
    // Select the fixture project through its observed session action, then open a fresh draft.
    await openBoard()
    await rowAction("Open —", targets[0])
    await audit.wait(`document.querySelector('[data-workspace-directory]')?.getAttribute('data-workspace-directory') === ${JSON.stringify(targets[0].directory)}`, "selected project")
    const newSessionName = await session.evaluate(String.raw`document.querySelector('[data-sidebar-new-session]')?.textContent.replace(/\s+/g,' ').trim()`)
    await audit.click(newSessionName)
    await audit.wait('Boolean(document.querySelector("[data-draft-home]"))', "new session draft")
    // Review works in the draft without creating a runtime session.
    await audit.click("Review changes", { role: "button" })
    await reviewDirectory(targets[0])
    await checkDiff(0)
    await capture("draft-review")
    // Scope: nothing is staged in the fixture, and every change is in the working tree.
    const changedCount = n => `/\\b${n} files? changed\\b/.test(document.querySelector('[data-review-changes]')?.innerText ?? '')`
    await audit.click("Staged", { role: "radio" })
    await audit.wait(`document.querySelector('[data-review-scope] [aria-checked="true"]')?.textContent === 'Staged' && ${changedCount(0)}`, "staged scope is empty")
    await audit.click("Unstaged", { role: "radio" })
    await audit.wait(changedCount(5), "unstaged scope lists the five working-tree changes")
    await audit.click("All", { role: "radio" })
    await audit.wait(changedCount(5), "all scope restored")
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
      await audit.wait(`document.querySelector('[data-workspace-directory]')?.getAttribute('data-workspace-directory') === ${JSON.stringify(target.directory)}`, "workspace context")
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
        await checkGroupedBoard()
        await capture(`board-grouped-${theme}-${width}`)
        await capture(`board-${theme}-${width}`)
      }
      await rowAction("Open —", targets[0])
      await audit.wait('Boolean(document.querySelector("[data-chat-input]"))', "chat composer")
      await checkComposerClearance()
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
          const rendered = Array.from(document.querySelectorAll('diffs-container')).filter(e => e.shadowRoot?.querySelector('pre[data-diff-type]'))
          // Added, untracked and deleted files have one side and always use the single layout.
          return rendered.length > 0 && rendered.every(e => {
            const twoSided = e.shadowRoot.textContent.includes('Original project') && e.shadowRoot.textContent.includes('Revised project')
            const expected = paneWidth >= 1100 && twoSided ? 'split' : 'single'
            return e.shadowRoot.querySelector('pre[data-diff-type]').getAttribute('data-diff-type') === expected
          })
        })()`, "dynamic layout follows pane width")
        await checkReviewRail(`review-rail-${theme}-${width}`)
        await capture(`review-${theme}-${width}`)
      }
      await audit.click("Workspace", { role: "button" })
      await audit.wait('document.body.innerText.includes("Fixture conversation for project A") && !document.querySelector("[data-review-changes]")', "return to chat")
      await audit.wait(`document.querySelector('[data-chat-input]')?.value === 'Preserve this unsent review draft'`, "unsent draft survives review")
      await checkComposerClearance()
      // Mission Control overlays the mounted chat; its opening does not clear the composer variable.
      await openBoard()
    }
    if (args.artifacts) await fs.writeFile(path.join(args.artifacts, "receipt.json"), JSON.stringify({ targets, calls: audit.calls }, null, 2))
    return { name: "supervision-workspace", ok: true, detail: "Native WebMCP search/status/disclosure and project grouping, draft review, two five-file fixture repositories, review progress and keyboard navigation, composer toast clearance, pane resizing and dark/light layouts" }
  }],
})
for (const line of outcome.lines) console.log(line)
process.exitCode = outcome.ok ? 0 : 1
