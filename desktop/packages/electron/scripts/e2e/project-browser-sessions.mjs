// W7 runs within project-browser-webmcp.mjs, including the existing three-platform CI job.
import fs from "node:fs/promises"
import path from "node:path"
import { CdpSession, listTargets, waitForCondition } from "./cdp.mjs"

export async function checkBrowserSessions({ session, debuggingPort, e2e, audit, pageUrl, secondUrl, artifacts }) {
  const primary = e2e.scenario.session
  const secondary = e2e.scenario.portfolio[0].session
  const ipc = (args) =>
    session.evaluate(`window.__AX_CODE_DESKTOP__.invoke('desktop_webmcp_browser', ${JSON.stringify(args)})`)
  const listing = () => ipc({ action: "list" })
  const state = async (id) => (await listing()).views.find((view) => view.sessionID === id)
  const origin = (await fs.readFile(e2e.stubOriginPath, "utf8")).trim()
  const runtime = async (body) => {
    const response = await fetch(
      `${origin}/__e2e__/browser-test`,
      body
        ? {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          }
        : {},
    )
    if (!response.ok) throw new Error(`W7 fixture request failed: ${response.status}`)
    return response.json()
  }
  let actions = 0
  let stressDisclosures = 0
  const action = async (run) => {
    actions++
    return run()
  }
  // Fixture preparation: two real session-owned native guests, with different project partitions.
  const second = await ipc({
    action: "create",
    directory: secondary.directory,
    sessionID: secondary.id,
    url: secondUrl,
  })
  if (second.enabled) throw new Error("W7 fresh page inherited access")
  const switchTo = async (id, counted = true, keyboard = false) => {
    const run = async () => {
      await audit.wait(
        `Boolean(document.querySelector('[data-webmcp-pages] [data-webmcp-session="${id}"]'))`,
        "page switcher entry",
      )
      if (!(await session.evaluate(`document.querySelector('[data-webmcp-pages]').open`))) {
        if (counted) actions++
        else stressDisclosures++
        await session.evaluate(`document.querySelector('[data-webmcp-pages] summary').click()`)
      }
      const control = (await audit.all()).controls.find(
        (control) =>
          control.name.startsWith("Show page:") &&
          control.name.includes(id === primary.id ? pageUrl.slice(0, -1) : secondUrl.slice(0, -1)),
      )
      if (!control) throw new Error(`Missing W7 switcher control for ${id}`)
      if (keyboard) {
        await session.evaluate(
          `document.querySelector('[data-webmcp-pages] [data-webmcp-session="${id}"] button').focus()`,
        )
        for (const type of ["keyDown", "keyUp"])
          await session.send("Input.dispatchKeyEvent", {
            type,
            key: "Enter",
            code: "Enter",
            windowsVirtualKeyCode: 13,
            ...(type === "keyDown" ? { text: "\r", unmodifiedText: "\r" } : {}),
          })
      } else await audit.click(control.name, { role: "button" })
      await waitForCondition(async () => (await state(id))?.visible, { label: `W7 selected ${id}` })
      await audit.wait(
        `Boolean(document.querySelector('[aria-label="Copy session ID ${id}"]'))`,
        "owning session selected",
      )
    }
    return counted ? action(run) : run()
  }
  await switchTo(secondary.id)
  await action(() => audit.click("Enable agent access", { role: "button" }))
  await waitForCondition(async () => (await state(secondary.id))?.enabled, { label: "W7 second access on" })
  if (!(await state(primary.id))?.enabled) throw new Error("W7 switching revoked the first session")

  const targetFor = async (url) => (await listTargets(debuggingPort)).find((target) => target.url === url)
  const firstTarget = await targetFor(pageUrl)
  const secondTarget = await targetFor(secondUrl)
  if (!firstTarget || !secondTarget || firstTarget.id === secondTarget.id)
    throw new Error("W7 needs independent guest targets")
  const guestA = await CdpSession.connect(firstTarget.webSocketDebuggerUrl)
  const guestB = await CdpSession.connect(secondTarget.webSocketDebuggerUrl)
  try {
    // Cookies ignore the port: this proves project isolation even with two loopback ports.
    await guestA.evaluate(
      `localStorage.setItem('w7', 'project-a'); document.cookie = 'w7=project-a; SameSite=Lax'; document.body.dataset.w7 = 'project-a'`,
    )
    const emptyB = await guestB.evaluate(`({ cookie: document.cookie, storage: localStorage.getItem('w7') })`)
    if (emptyB.cookie.includes("project-a") || emptyB.storage !== null) throw new Error("W7 storage crossed projects")
    await guestB.evaluate(
      `localStorage.setItem('w7', 'project-b'); document.cookie = 'w7=project-b; SameSite=Lax'; document.body.dataset.w7 = 'project-b'`,
    )
    if (!(await guestA.evaluate(`document.cookie`)).includes("w7=project-a"))
      throw new Error("W7 cookie overwritten by another project")

    // Real provider request held while hidden, then surfaced through Needs you.
    await runtime({ sessionID: primary.id, requestID: "w7-hidden-a" })
    await waitForCondition(async () => (await state(primary.id))?.waiting, { label: "W7 hidden request waits" })
    if ((await runtime()).replies.some((reply) => reply.requestID === "w7-hidden-a"))
      throw new Error("W7 hidden page acted")
    await audit.wait(
      `Array.from(document.querySelectorAll('button')).some(button => button.getAttribute('aria-label')?.startsWith('Needs you, '))`,
      "W7 Needs you badge",
    )
    const needs = (await audit.all()).controls.find((control) => control.name.startsWith("Needs you, "))
    if (!needs) throw new Error("W7 missing Needs you control")
    await action(() => audit.click(needs.name, { role: "button" }))
    await audit.wait(
      `Boolean(document.querySelector('[data-webmcp-waiting] [data-webmcp-session-page="${primary.id}"]'))`,
      "W7 waiting page inbox",
    )
    await action(() =>
      session.evaluate(
        `document.querySelector('[data-webmcp-waiting] [data-webmcp-session-page="${primary.id}"]').click()`,
      ),
    )
    await waitForCondition(
      async () =>
        (await runtime()).replies.some(
          (reply) =>
            reply.requestID === "w7-hidden-a" && reply.sessionID === primary.id && reply.status === "Completed",
        ),
      { label: "W7 held request completes on its page" },
    )
    await switchTo(secondary.id)

    // Revoke the hidden first session through the switcher; provider B must continue to execute.
    const revoke = (await audit.all()).controls.find(
      (control) => control.name.startsWith("Revoke agent access:") && control.name.includes(pageUrl.slice(0, -1)),
    )
    if (!revoke) throw new Error("W7 missing first session revoke")
    await action(() => audit.click(revoke.name, { role: "button" }))
    await waitForCondition(async () => !(await state(primary.id))?.enabled, { label: "W7 independent revocation" })
    if (!(await state(secondary.id))?.enabled) throw new Error("W7 revoke crossed session scope")
    await runtime({ sessionID: secondary.id, requestID: "w7-survivor-b" })
    await waitForCondition(
      async () =>
        (await runtime()).replies.some(
          (reply) =>
            reply.requestID === "w7-survivor-b" && reply.sessionID === secondary.id && reply.status === "Completed",
        ),
      { label: "W7 surviving provider executes" },
    )
    const replies = (await runtime()).replies
    if (
      !JSON.stringify(replies.find((reply) => reply.requestID === "w7-hidden-a")?.output).includes("Ship the beta") ||
      JSON.stringify(replies.find((reply) => reply.requestID === "w7-survivor-b")?.output).includes("Ship the beta")
    )
      throw new Error("W7 a provider read the wrong project page")
    const surviving = (await runtime()).providers
    if (surviving.length !== 1 || surviving[0].sessionID !== secondary.id)
      throw new Error("W7 wrong surviving provider")
    if (actions > 12) throw new Error(`W7 took ${actions} actions, budget 12`)

    // Warm up both renderer paths before collecting bounded DOM listeners and heaps.
    for (let i = 0; i < 4; i++) await switchTo(i % 2 ? secondary.id : primary.id, false)
    const metrics = async () => {
      const results = []
      for (const target of [session, guestA, guestB]) {
        await target.send("HeapProfiler.collectGarbage")
        results.push({
          ...(await target.send("Memory.getDOMCounters")),
          ...(await target.send("Runtime.getHeapUsage")),
        })
      }
      return results
    }
    const before = await metrics()
    const initialViews = (await listing()).views.map((view) => ({ id: view.id, generation: view.generation }))
    for (let i = 0; i < 50; i++) await switchTo(i % 2 ? secondary.id : primary.id, false, i >= 25)
    const after = await metrics()
    for (let i = 0; i < after.length; i++) {
      if (after[i].jsEventListeners > before[i].jsEventListeners + 30)
        throw new Error(`W7 listeners grew on target ${i}`)
      if (after[i].usedSize > before[i].usedSize + 16 * 1024 * 1024) throw new Error(`W7 heap grew on target ${i}`)
    }
    const finalViews = await listing()
    if (finalViews.liveViews !== 2 || finalViews.views.length !== 2)
      throw new Error("W7 live pool grew while switching")
    for (const before of initialViews) {
      if (!finalViews.views.some((view) => view.id === before.id && view.generation === before.generation))
        throw new Error("W7 switching recreated a page")
    }
    if (
      (await guestA.evaluate(`localStorage.getItem('w7')`)) !== "project-a" ||
      (await guestB.evaluate(`localStorage.getItem('w7')`)) !== "project-b"
    )
      throw new Error("W7 lost project storage")
    const evidence = {
      actions,
      fixtureSetup: "Second page created by IPC; enrollment and revocation use rendered controls",
      warmupSwitches: 4,
      stressSwitchActions: 50,
      keyboardSwitches: 25,
      stressDisclosures,
      memoryScope: "Renderer and both guest JS heaps after GC; DOM listener counts, not whole-process RSS",
      before,
      after,
      finalViews,
      runtime: await runtime(),
    }
    if (artifacts) {
      await fs.writeFile(path.join(artifacts, "w7-sessions.json"), JSON.stringify(evidence, null, 2))
      const { data } = await session.send("Page.captureScreenshot", { format: "png" })
      await fs.writeFile(path.join(artifacts, "w7-sessions.png"), Buffer.from(data, "base64"))
      // Main-renderer CDP screenshots omit native child views; retain their page evidence separately.
      for (const [name, guest] of [["a", guestA], ["b", guestB]]) {
        const shot = await guest.send("Page.captureScreenshot", { format: "png" })
        await fs.writeFile(path.join(artifacts, `w7-page-${name}.png`), Buffer.from(shot.data, "base64"))
      }
    }
    return `W7 two projects retain independent pages/storage; hidden call waits; scoped revoke leaves a working provider; ${actions}/12 actions plus 50 switches with bounded heaps/listeners`
  } finally {
    guestA.close()
    guestB.close()
  }
}
