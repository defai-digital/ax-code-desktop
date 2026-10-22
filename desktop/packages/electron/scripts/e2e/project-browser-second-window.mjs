import fs from "node:fs/promises"
import path from "node:path"
import { CdpSession, isAppPageTarget, listTargets, waitForCondition, waitForTarget } from "./cdp.mjs"
import { SettingsWebMcpAudit } from "./settings-webmcp.mjs"

export async function checkBrowserSecondWindow({ session, debuggingPort, primary, owner, artifacts }) {
  const before = new Set((await listTargets(debuggingPort)).map((target) => target.id))
  await session.evaluate(`window.__AX_CODE_DESKTOP__.invoke('desktop_new_window', {})`)
  const target = await waitForTarget(debuggingPort, (target) => !before.has(target.id) && isAppPageTarget(target))
  const second = await CdpSession.connect(target.webSocketDebuggerUrl)
  let closedByJourney = false
  try {
    const audit = new SettingsWebMcpAudit(second)
    await audit.client.enable()
    const row = `[data-session-row="${primary.id}"]`
    await audit.wait(`Boolean(document.querySelector(${JSON.stringify(row)}))`, "second-window session row")
    await second.evaluate(`Array.from(document.querySelector(${JSON.stringify(row)}).querySelectorAll('button'))
      .find(button => button.textContent.trim().startsWith(${JSON.stringify(primary.title)})).click()`)
    await audit.wait(
      `Boolean(document.querySelector('[aria-label="Copy session ID ${primary.id}"]'))`,
      "second-window session selected",
    )
    const header = (await audit.all()).controls.find((control) => control.name.startsWith("Project browser (WebMCP):"))
    if (!header) throw new Error("Second window is missing its project browser control")
    await audit.client.call("ax_desktop_click", { ref: header.ref })
    await audit.wait(`Boolean(document.querySelector('#webmcp-mode-tab-agent'))`, "second-window browser pane")
    await audit.click("Project browser (WebMCP)", { role: "tab" })
    await audit.wait(
      `Array.from(document.querySelectorAll('[role="alert"]')).some(element => element.textContent.includes("This session's browser is open in another window"))`,
      "named browser ownership",
    )
    const controls = (await audit.all()).controls
    if (controls.some((control) => control.role === "button" && control.name === "Reopen"))
      throw new Error("Second window offers the looping Reopen action")
    if (artifacts) {
      await fs.writeFile(path.join(artifacts, "second-window.json"), JSON.stringify({ controls, owner }, null, 2))
      const { data } = await second.send("Page.captureScreenshot", { format: "png" })
      await fs.writeFile(path.join(artifacts, "second-window.png"), Buffer.from(data, "base64"))
    }
    await audit.click("Focus that window", { role: "button" })
    const live = await session.evaluate(
      `window.__AX_CODE_DESKTOP__.invoke('desktop_webmcp_browser', { action: 'status', id: ${JSON.stringify(owner.id)} })`,
    )
    if (!live.enabled || live.generation !== owner.generation || live.url !== owner.url)
      throw new Error("Second-window focus disturbed the owner page")
    // A disposable blank page exercises the real owner's close event without an OS confirmation dialog.
    const blank = await second.evaluate(`window.__AX_CODE_DESKTOP__.invoke('desktop_webmcp_browser', {
      action: 'create', directory: ${JSON.stringify(owner.directory)}, sessionID: null, url: 'about:blank'
    })`)
    if (!blank.id) throw new Error("Second-window blank page was not created")
    await second.evaluate(`void window.__AX_CODE_DESKTOP__.invoke('desktop_close_current_window', {})`)
    await waitForCondition(async () => !(await listTargets(debuggingPort)).some((item) => item.id === target.id), {
      label: "authorized second-window close",
    }).catch(async (error) => {
      const state = await second.evaluate(`window.__AX_CODE_DESKTOP__.invoke('desktop_webmcp_browser', { action: 'list' })`)
      if (artifacts) await fs.writeFile(path.join(artifacts, "second-window-close-failure.json"), JSON.stringify(state, null, 2))
      throw error
    })
    closedByJourney = true
    const remaining = await session.evaluate(`window.__AX_CODE_DESKTOP__.invoke('desktop_webmcp_browser', { action: 'list' })`)
    if (remaining.otherWindows.length || remaining.views.some((page) => page.id === blank.id))
      throw new Error("Closed secondary owner retained a browser page")
    return "Second window names/focuses the owner without Reopen; owner enrollment/document preserved; clean owner close releases its guest"
  } finally {
    if (!closedByJourney) await second.send("Page.close").catch(() => {})
    second.close()
  }
}
