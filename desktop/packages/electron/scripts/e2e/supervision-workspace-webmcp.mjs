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
import { STUB_REVIEW_DIFFS } from "./stub-runtime.mjs"

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
    const reviewArmed = await fetch(`${origin}/__e2e__/step`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ step: "review-scopes" }),
    })
    if (!reviewArmed.ok) throw new Error("Could not arm session review fixture")
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
        const roots = Array.from(document.querySelectorAll('[data-session-grid], [data-mission-control], [data-workspace-navigation], [data-review-changes], [role="dialog"]:has([cmdk-root])')).filter(visible)
        return roots.map(root => ({
          kind: root.hasAttribute('data-session-grid') ? 'session-grid' : root.hasAttribute('data-mission-control') ? 'board' : root.hasAttribute('data-review-changes') ? 'review' : root.matches('[role="dialog"]') ? 'palette' : 'navigation',
          width: root.clientWidth, scrollWidth: root.scrollWidth, text: root.innerText,
          groups: Array.from(root.querySelectorAll('[role="rowgroup"]')).map(e => ({ name:e.getAttribute('aria-label'), rows:Array.from(e.querySelectorAll('.mission-control-row')).map(row=>row.id) })),
          files: Array.from(root.querySelectorAll('[data-review-file]')).map(e => ({ path:e.dataset.reviewFile, current:e.getAttribute('aria-current'), viewed:e.querySelector('input[type="checkbox"]')?.checked })),
          progress: root.querySelector('[role="progressbar"]')?.getAttribute('aria-label'),
          reviewScope: root.querySelector('[data-review-scope] [aria-checked="true"]')?.textContent,
          sessionScope: root.querySelector('[data-session-changes]')?.dataset.sessionScope,
          selectedRows: Array.from(root.querySelectorAll('.mission-control-row[aria-selected="true"]')).map(e => e.id),
          toolbar: root.querySelector('[role="toolbar"]')?.innerText,
          paletteGroups: Array.from(root.querySelectorAll('[cmdk-group-heading]')).filter(visible).map(e => e.textContent.trim()),
          paletteSessions: Array.from(root.querySelectorAll('[cmdk-item][data-value^="session:"]')).filter(visible).map(e => ({ value:e.dataset.value, state:e.querySelector('[data-palette-session-state]')?.dataset.paletteSessionState })),
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
    const dispatchKey = async (key, code, windowsVirtualKeyCode, modifiers = 0) => {
      await session.send("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode, modifiers })
      await session.send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode, modifiers })
    }
    const checkBulkSelection = async theme => {
      const rowIds = targets.map(target => `mission-row-${target.id}`)
      const selectedRows = ids => `(() => {
        const board = document.querySelector('[data-mission-control][role="grid"]')
        const expected = ${JSON.stringify(ids)}
        const selected = Array.from(board?.querySelectorAll('.mission-control-row[aria-selected="true"]') || []).map(e => e.id)
        return board?.checkVisibility() && selected.length === expected.length && expected.every(id => selected.includes(id)) &&
          Array.from(board.querySelectorAll('.mission-control-row')).every(row => row.querySelector('input[type="checkbox"]')?.checked === expected.includes(row.id))
      })()`
      // Toolbar/grid are not in WebMCP's control inventory; inspect their roles in the rendered DOM.
      const toolbar = `document.querySelector('[data-mission-control] [role="toolbar"][aria-label="Selected sessions"]')`
      const checkCount = count => audit.wait(`${toolbar}?.checkVisibility() && ${toolbar}.textContent.includes('${count} selected') && document.querySelector('[data-mission-control] [role="status"][aria-live="polite"]')?.textContent.trim() === '${count} selected'`, `${count} selected in the bulk toolbar`)
      await audit.wait(`${selectedRows([])} && !${toolbar}`, "bulk selection starts empty")
      const labels = await session.evaluate(`(() => {
        const first = document.getElementById(${JSON.stringify(rowIds[0])})
        const other = document.getElementById(${JSON.stringify(rowIds[1])})
        if (!first || !other || first.closest('[role="rowgroup"]') === other.closest('[role="rowgroup"]')) throw new Error('Expected fixture rows in distinct project groups')
        return {
          row:first.querySelector('input[type="checkbox"]')?.getAttribute('aria-label'),
          group:other.closest('[role="rowgroup"]')?.querySelector('.mission-group-header input[type="checkbox"]')?.getAttribute('aria-label')
        }
      })()`)
      const rowName = await observedControl(labels.row, "input")
      const groupName = await observedControl(labels.group, "input")
      if (!rowName.startsWith("Select ") || !groupName.startsWith("Select all in ")) throw new Error("Unexpected bulk selection labels")
      await audit.click(rowName, { role: "input" })
      await audit.wait(selectedRows([rowIds[0]]), "fixture row checkbox selects only its session")
      await checkCount(1)
      await audit.click(await observedControl(groupName, "input"), { role: "input" })
      await audit.wait(selectedRows(rowIds), "other project checkbox adds its session to the selection")
      await checkCount(2)
      const stopName = await observedControl("Stop 0 running")
      const archiveName = await observedControl("Archive selected")
      const clearName = await observedControl("Clear selection")
      await audit.wait(`(() => {
        const buttons = Array.from(${toolbar}?.querySelectorAll('button') || [])
        const stop = buttons.find(e => e.textContent.trim() === ${JSON.stringify(stopName)})
        return stop?.disabled === true && buttons.some(e => e.textContent.trim() === ${JSON.stringify(archiveName)}) &&
          buttons.some(e => e.textContent.trim() === ${JSON.stringify(clearName)})
      })()`, "bulk actions exist and Stop is disabled with no running sessions")
      // Never invoke Stop or Archive: the runtime fixture must remain unchanged.
      await capture(`board-bulk-${theme}-1280`)
      await audit.click(clearName)
      await audit.wait(`${selectedRows([])} && !${toolbar}`, "Clear selection removes the toolbar and unchecks rows")
      const activeRow = await session.evaluate(`(() => {
        const board = document.querySelector('[data-mission-control][role="grid"]')
        board.focus({ preventScroll:true })
        return board.getAttribute('aria-activedescendant')
      })()`)
      if (!rowIds.includes(activeRow)) throw new Error(`Unexpected active fixture row: ${activeRow}`)
      await audit.wait(`document.activeElement === document.querySelector('[data-mission-control][role="grid"]')`, "board grid owns keyboard focus")
      await dispatchKey("x", "KeyX", 88)
      await audit.wait(selectedRows([activeRow]), "x selects the active row")
      await checkCount(1)
      await dispatchKey("Escape", "Escape", 27)
      await audit.wait(`${selectedRows([])} && !${toolbar}`, "Escape clears selection and keeps the board open")
    }
    const checkRankedPalette = async theme => {
      const controls = (await audit.all()).controls
      const opener = controls.find(control => control.role === "button" && !control.disabled &&
        ["Command Palette", "Open command palette"].includes(control.name))
      if (opener) {
        await audit.click(opener.name, { role: "button" })
      } else {
        // shortcuts.ts: open_command_palette defaults to mod+p in this isolated, fresh profile.
        await dispatchKey("p", "KeyP", 80, process.platform === "darwin" ? 4 : 2)
      }
      const palette = `document.querySelector('[role="dialog"]:has([cmdk-root])')`
      await audit.wait(`${palette}?.checkVisibility() && ${palette}.querySelector('[cmdk-input]')?.value === ''`, "empty command palette opened")
      await audit.wait(`(() => {
        const root = ${palette}
        const headings = Array.from(root.querySelectorAll('[cmdk-group-heading]')).filter(e => e.checkVisibility())
        const sessions = Array.from(root.querySelectorAll('[cmdk-item][data-value^="session:"]'))
        const expected = ${JSON.stringify(targets.map(target => `session:${target.id}`))}
        return headings[0]?.textContent.trim() === 'Sessions' &&
          sessions.length >= expected.length && expected.every(value => sessions.filter(e => e.dataset.value === value).length === 1) &&
          sessions.slice(0, expected.length).every(e => expected.includes(e.dataset.value) && e.closest('[cmdk-group]')?.querySelector('[cmdk-group-heading]') === headings[0] &&
            e.checkVisibility() && e.querySelector('[data-palette-session-state]')?.checkVisibility() &&
            ['permission', 'question', 'error', 'goal', 'review'].includes(e.querySelector('[data-palette-session-state]')?.dataset.paletteSessionState) &&
            Boolean(e.querySelector('[data-palette-session-state]')?.textContent.trim()))
      })()`, "Sessions is the first group; both fixture sessions precede all other sessions and have visible state badges")
      const names = await session.evaluate(`Array.from(${palette}.querySelectorAll('[cmdk-item][data-value^="session:"]')).slice(0, 2).map(e => e.textContent.replace(/\\s+/g, ' ').trim().slice(0, 160))`)
      for (const name of names) await observedControl(name, "option")
      await capture(`palette-${theme}`)
      await audit.wait(`${palette}?.contains(document.activeElement)`, "palette owns keyboard focus")
      await dispatchKey("Escape", "Escape", 27)
      await audit.wait(`!${palette}`, "Escape closes the command palette")
      await audit.wait(`document.querySelector('[data-mission-control]')?.checkVisibility() && document.querySelectorAll('.mission-control-row').length === 2`, "board restored after palette dismissal")
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
      await checkRailEditorControls()
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
    const checkRailEditorControls = async () => {
      await audit.wait(`document.querySelector('[data-review-scope] [aria-checked="true"]')?.textContent === 'All' && document.querySelector('[data-review-changes] .review-file-rail')?.checkVisibility()`, "All scope has a visible file rail")
      const rows = await session.evaluate(`Array.from(document.querySelectorAll('[data-review-changes] [data-review-file]')).map(row => ({
        file:row.dataset.reviewFile,
        buttons:Array.from(row.querySelectorAll('.review-file-rail__open')).map(button => ({
          name:button.getAttribute('aria-label'), visible:button.checkVisibility(), disabled:button.disabled
        }))
      }))`)
      if (JSON.stringify(rows.map(row => row.file).sort()) !== JSON.stringify(changedFiles)) throw new Error("Expected all git fixture rows for editor controls")
      for (const row of rows) {
        const [button] = row.buttons
        if (row.buttons.length !== 1 || !button.visible || button.disabled) throw new Error(`Missing usable editor control for ${row.file}`)
        const name = await observedControl(button.name)
        if (name !== `Open ${path.posix.basename(row.file)} in the editor`) throw new Error(`Unexpected editor control: ${name}`)
      }
      // Inventory only: opening an editor would leave the review under test.
    }
    const checkSessionReview = async theme => {
      const selectScope = async label => {
        const name = await observedControl(label, "radio")
        await audit.click(name, { role: "radio" })
        await audit.wait(`document.querySelector('[data-review-scope] [aria-checked="true"]')?.textContent === ${JSON.stringify(name)}`, `${name} scope selected`)
      }
      const checkFiles = async (scope, files) => {
        await audit.wait(`(() => {
          const root = document.querySelector('[data-session-changes]')
          const expected = ${JSON.stringify(files.map(file => file.file).sort())}
          const actual = Array.from(root?.querySelectorAll('[data-review-file]') || []).map(e => e.dataset.reviewFile).sort()
          return root?.dataset.sessionScope?.split(':')[0] === ${JSON.stringify(scope)} &&
            root.querySelector('.review-file-rail')?.checkVisibility() && JSON.stringify(actual) === JSON.stringify(expected) &&
            root.querySelector('[role="progressbar"]')?.getAttribute('aria-valuemax') === String(expected.length)
        })()`, `${scope} rail contains exactly its fixture files`)
        await audit.wait(`(() => {
          const root = document.querySelector('[data-session-changes]')
          const selected = root?.querySelector('[data-review-file][aria-current="true"]')?.dataset.reviewFile
          const file = ${JSON.stringify(files)}.find(file => file.file === selected)
          return file && Array.from(root.querySelectorAll('diffs-container')).some(e => e.shadowRoot?.textContent.includes(file.after.trim()))
        })()`, `${scope} selected fixture diff rendered`)
        const mutationControls = await session.evaluate(`(() => {
          const names = []
          const inspect = root => {
            for (const e of root.querySelectorAll('*')) {
              if (e.matches('button, [role="button"], input[type="button"], input[type="submit"]')) {
                const name = [e.getAttribute('aria-label'), e.getAttribute('title'), e.textContent, e.value].filter(Boolean).join(' ')
                if (/stage|revert/i.test(name)) names.push(name)
              }
              if (e.shadowRoot) inspect(e.shadowRoot)
            }
          }
          inspect(document.querySelector('[data-session-changes]'))
          return names
        })()`)
        if (mutationControls.length) throw new Error(`${scope} exposes stage/revert controls: ${JSON.stringify(mutationControls)}`)
      }
      await selectScope("This session")
      await checkFiles("session", STUB_REVIEW_DIFFS)
      await capture(`review-session-${theme}`)
      await selectScope("Last turn")
      await checkFiles("turn", [STUB_REVIEW_DIFFS[1]])
      await capture(`review-session-${theme}-last-turn`)
      await selectScope("All")
      await audit.wait(`!document.querySelector('[data-session-changes]') && JSON.stringify(Array.from(document.querySelectorAll('[data-review-changes] [data-review-file]')).map(e => e.dataset.reviewFile).sort()) === ${JSON.stringify(JSON.stringify(changedFiles))}`, "All restores exactly the five git fixture files")
      await checkDiff(0)
      await checkRailEditorControls()
      await capture(`review-session-${theme}-all`)
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
        if (width === 1280) {
          await checkBulkSelection(theme)
          await checkRankedPalette(theme)
        }
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
        if (theme === "dark" && width === 2800) await checkSessionReview(theme)
      }
      await audit.click("Workspace", { role: "button" })
      await audit.wait('document.body.innerText.includes("Fixture conversation for project A") && !document.querySelector("[data-review-changes]")', "return to chat")
      await audit.wait(`document.querySelector('[data-chat-input]')?.value === 'Preserve this unsent review draft'`, "unsent draft survives review")
      await checkComposerClearance()
      // Mission Control overlays the mounted chat; its opening does not clear the composer variable.
      await openBoard()
    }
    await viewport(1400)
    // Two sessions in one window: open project A's conversation, then Cmd+click project B's row on the board.
    // B must appear in the split pane as an embedded chat while A stays the main conversation.
    await audit.click("Workspace", { role: "button" }).catch(() => {})
    await openBoard()
    await rowAction("Open —", targets[0])
    await audit.wait('document.body.innerText.includes("Fixture conversation for project A")', "main conversation is project A")
    await openBoard()
    const besideRect = await session.evaluate(`(() => {
      const r = document.getElementById(${JSON.stringify(`mission-row-${targets[1].id}`)})?.getBoundingClientRect()
      return r ? { x: r.left + Math.min(40, r.width / 2), y: r.top + r.height / 2 } : null
    })()`)
    if (!besideRect) throw new Error("Project B row not found for open-beside")
    for (const type of ["mousePressed", "mouseReleased"]) {
      await session.send("Input.dispatchMouseEvent", { type, x: besideRect.x, y: besideRect.y, button: "left", clickCount: 1, modifiers: 4 })
    }
    // Visible, not merely mounted: a hidden frame once passed this check while another view covered it.
    await audit.wait(`Array.from(document.querySelectorAll('iframe')).some(f => {
      const src = f.getAttribute('src') || ''
      const r = f.getBoundingClientRect()
      return src.includes('ocPanel=session-chat') && src.includes(${JSON.stringify(encodeURIComponent(targets[1].id))}) &&
        f.checkVisibility() && r.width > 200 && r.height > 200 &&
        (f.contentDocument?.body?.innerText || '').includes('Fixture conversation for project B')
    })`, "project B's conversation renders beside the chat")
    await audit.wait('!document.querySelector("[data-mission-control]") && document.body.innerText.includes("Fixture conversation for project A")', "project A stays the main conversation")
    const besideFrame = `Array.from(document.querySelectorAll('iframe')).find(f => (f.getAttribute('src') || '').includes(${JSON.stringify(encodeURIComponent(targets[1].id))}))`
    // Both conversations keep their own composer, and a narrow panel grows so the pair can be compared.
    await audit.wait(`(() => {
      const frame = ${besideFrame}
      const main = document.querySelector('[data-chat-input]')
      const inner = frame?.contentDocument?.querySelector('[data-chat-input]')
      return Boolean(main && main.checkVisibility() && inner && inner.checkVisibility() && frame.getBoundingClientRect().width >= 500)
    })()`, "both sessions show a composer and the beside pane is wide")
    await capture("open-beside")
    // The beside session carries its own review: its Changes tab shows project B's repository, not project A's.
    await session.evaluate(`${besideFrame}.contentDocument.getElementById('embedded-session-tab-changes').click(); true`)
    await audit.wait(`(() => {
      const doc = ${besideFrame}?.contentDocument
      const rendered = Array.from(doc?.querySelectorAll('diffs-container') || []).map(e => e.shadowRoot?.textContent || '').join(' ')
      return Boolean(doc?.querySelector('[data-embedded-session-changes]')) && rendered.includes('Revised project 1') && !rendered.includes('Revised project 0')
    })()`, "the beside session's Changes tab shows its own repository")
    await capture("open-beside-changes")
    // Files and Terminal belong to the beside session's own repository too. The stub runtime lists no files, so the check is
    // that the tree asks for project B's directory and never project A's.
    await session.evaluate(`${besideFrame}.contentDocument.getElementById('embedded-session-tab-files').click(); true`)
    await audit.wait(`(() => {
      const frame = ${besideFrame}
      const panel = frame?.contentDocument?.querySelector('[data-embedded-session-files]')
      const listed = frame.contentWindow.performance.getEntriesByType('resource')
        .filter(e => e.name.includes('/api/fs/list'))
        .map(e => (new URL(e.name).searchParams.get('path') || '').replace(/\\\\/g, '/').replace(/\\/+$/, ''))
      return Boolean(panel && panel.checkVisibility()) && listed.some(p => p?.endsWith(${JSON.stringify("/" + path.basename(targets[1].directory))})) &&
        !listed.some(p => p?.endsWith(${JSON.stringify("/" + path.basename(targets[0].directory))}))
    })()`, "the beside session's Files tab lists its own repository")
    await capture("open-beside-files")
    await session.evaluate(`${besideFrame}.contentDocument.getElementById('embedded-session-tab-terminal').click(); true`)
    await audit.wait(`(() => {
      const doc = ${besideFrame}?.contentDocument
      const panel = doc?.querySelector('[data-embedded-session-terminal]')
      const viewport = panel?.querySelector('.terminal-viewport-container')
      const files = doc?.querySelector('[data-embedded-session-files]')
      return Boolean(panel && panel.checkVisibility() && viewport && viewport.getBoundingClientRect().height > 100 &&
        files && !files.checkVisibility())
    })()`, "the beside session's Terminal tab shows a terminal and keeps Files mounted")
    await capture("open-beside-terminal")
    await session.evaluate(`${besideFrame}.contentDocument.getElementById('embedded-session-tab-chat').click(); true`)
    await audit.wait(`(() => {
      const doc = ${besideFrame}?.contentDocument
      return Boolean(doc?.querySelector('[data-chat-input]')?.checkVisibility()) && !doc.querySelector('[data-embedded-session-changes]')
    })()`, "the beside session returns to its chat")
    if (args.artifacts) await fs.writeFile(path.join(args.artifacts, "receipt.json"), JSON.stringify({ targets, calls: audit.calls }, null, 2))
    // Session grid uses two independent embedded realms, each with its own composer.
    await openBoard()
    for (const target of targets) {
      const label = await session.evaluate(`document.getElementById(${JSON.stringify(`mission-row-${target.id}`)})?.querySelector('input[type="checkbox"]')?.getAttribute('aria-label')`)
      if (!label) throw new Error("Grid fixture selection checkbox is missing")
      await audit.click(await observedControl(label, "input"), { role: "input" })
    }
    await audit.click("Open as grid")
    await audit.wait(`(() => {
      const grid = document.querySelector('[data-session-grid]')
      const frames = Array.from(grid?.querySelectorAll('iframe') || [])
      const targets = ${JSON.stringify(targets.map(target => ({ id: target.id, directory: target.directory })))}
      return grid?.checkVisibility() && frames.length === 2 && targets.every(target => frames.some(frame => {
        const url = new URL(frame.src)
        const composer = frame.contentDocument?.querySelector('[data-chat-input]')
        return url.searchParams.get('sessionId') === target.id && url.searchParams.get('directory') === target.directory &&
          frame.checkVisibility() && frame.getBoundingClientRect().width >= 320 && composer?.checkVisibility()
      }))
    })()`, "two grid sessions visibly render their own composers")
    await capture("session-grid-two")
    await audit.click("Workspace", { role: "button" })
    await audit.wait(`!document.querySelector('[data-session-grid]')`, "leave grid")
    await audit.click("Session grid", { role: "button" })
    await audit.wait(`document.querySelector('[data-session-grid]')?.querySelectorAll('iframe').length === 2`, "return restores both grid panes")

    return { name: "supervision-workspace", ok: true, detail: "Native WebMCP search/status/disclosure and project grouping, bulk selection and keyboard clearing, ranked palette sessions and state badges, draft review, two five-file fixture repositories, review progress and keyboard navigation, observed rail editor controls, read-only This session/Last turn scopes and All restoration, composer toast clearance, a second project session opened beside the current chat with both composers and its own Changes, Files and Terminal tabs, pane resizing and dark/light layouts" }
  }],
})
for (const line of outcome.lines) console.log(line)
process.exitCode = outcome.ok ? 0 : 1
