#!/usr/bin/env node
// Native WebMCP navigation and Chromium scroll inputs over a renderer streaming fixture.
// No model call, runtime write, or user profile is involved.
import fs from "node:fs/promises"
import path from "node:path"
import { waitForCondition } from "./cdp.mjs"
import { journeyBoot } from "./journeys.mjs"
import { mentionsPath } from "./paths.mjs"
import { parseArgs, runHarness } from "./run.mjs"
import { SettingsWebMcpAudit } from "./settings-webmcp.mjs"
import { parseStubOrigin } from "./stub-origin.mjs"

const args = parseArgs(process.argv.slice(2))
const outcome = await runHarness({
  ...args,
  uiWebMcp: true,
  portfolio: true,
  journeys: [
    journeyBoot,
    async function journeyChatReaderScroll({ session, e2e }) {
      await session.send("Page.addScriptToEvaluateOnNewDocument", {
        source: `(() => {
      window.__markdownProbe = { sockets: [] }
      const probe = window.__markdownProbe
      window.WebSocket = new Proxy(window.WebSocket, { construct(target, args) {
        const socket = new target(...args)
        probe.sockets.push({ url: String(args[0]), socket })
        return socket
      } })
    })()`,
      })
      const origin = parseStubOrigin(await fs.readFile(e2e.stubOriginPath, "utf8"))
      const armed = await fetch(`${origin}/__e2e__/step`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ step: "portfolio-goals" }),
        redirect: "error",
      })
      if (!armed.ok) throw new Error("Could not arm fixture conversations")
      await session.send("Page.reload", { ignoreCache: true })
      await journeyBoot({ session })
      const audit = new SettingsWebMcpAudit(session)
      await audit.client.enable()
      const target = e2e.scenario.session
      await audit.wait('document.querySelectorAll("[data-project-row]").length >= 2', "project cards")
      let control
      await waitForCondition(
        async () => {
          control = (await audit.all()).controls.find(
            (entry) =>
              entry.role === "button" &&
              entry.name.includes(target.title) &&
              mentionsPath(entry.name, target.directory),
          )
          return Boolean(control)
        },
        { timeoutMs: 10_000, label: "fixture conversation control" },
      )
      await audit.click(control.name, { role: "button" })
      await audit.wait('document.body.innerText.includes("Fixture conversation for project A")', "fixture conversation")
      await audit.wait(
        'window.__markdownProbe.sockets.some(x => x.url.includes("/global/event/ws") && x.socket.readyState === 1)',
        "event socket",
      )

      const text =
        Array.from(
          { length: 40 },
          (_, index) =>
            `## Markdown section ${index}\r\n\r\n${"Text with **bold**, `code`, and Unicode 中文 😀. ".repeat(12)}\r\n\r\n`,
        ).join("") + "STREAM_TAIL"
      const fixture = { directory: target.directory, sessionID: target.id, parentID: "msg_e2e_portfolio_0", text }
      await session.evaluate(`(() => {
      const fixture = ${JSON.stringify(fixture)}
      const socket = window.__markdownProbe.sockets.find(x => x.url.includes('/global/event/ws') && x.socket.readyState === 1).socket
      const emit = payload => socket.dispatchEvent(new MessageEvent('message', {
        data: JSON.stringify({ type: 'event', directory: fixture.directory, payload }) }))
      const messageID = 'msg_zzzz_markdown_probe'
      const partID = 'prt_zzzz_markdown_probe'
      const info = { id: messageID, sessionID: fixture.sessionID, role: 'assistant', parentID: fixture.parentID,
        time: { created: Date.now() }, modelID: 'fixture', providerID: 'fixture', mode: 'build', agent: 'build',
        path: { cwd: fixture.directory, root: fixture.directory } }
      const part = { id: partID, messageID, sessionID: fixture.sessionID, type: 'text', text: fixture.text }
      window.__markdownProbe.append = delta => {
        emit({ type: 'message.part.delta', properties: { sessionID: fixture.sessionID, messageID,
          partID, field: 'text', delta, offset: part.text.length } })
        part.text += delta
      }
      window.__markdownProbe.finish = () => {
        emit({ type: 'message.part.updated', properties: { part: { ...part, time: { start: info.time.created, end: Date.now() } } } })
        emit({ type: 'message.updated', properties: { info: { ...info, time: { ...info.time, completed: Date.now() }, finish: 'stop' } } })
        emit({ type: 'session.status', properties: { sessionID: fixture.sessionID, status: { type: 'idle' } } })
      }
      emit({ type: 'session.status', properties: { sessionID: fixture.sessionID, status: { type: 'busy' } } })
      emit({ type: 'message.updated', properties: { info } })
      emit({ type: 'message.part.updated', properties: { part } })
    })()`)
      const scroll = `document.querySelector('[data-scrollbar="chat"]')`
      const metrics = () =>
        session.evaluate(`(() => {
        const el = ${scroll}, r = el.getBoundingClientRect()
        return { top: el.scrollTop, height: el.scrollHeight, viewport: el.clientHeight,
          max: el.scrollHeight - el.clientHeight, x: r.x, y: r.y, width: r.width,
          rectHeight: r.height, focused: document.activeElement === el }
      })()`)
      const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
      const capture = async (label) => {
        const value = await metrics()
        if (args.artifacts) {
          await fs.mkdir(args.artifacts, { recursive: true })
          await fs.writeFile(
            path.join(args.artifacts, label + ".json"),
            JSON.stringify({ metrics: value, ui: await audit.all() }, null, 2),
          )
          const { data } = await session.send("Page.captureScreenshot", { format: "png" })
          await fs.writeFile(path.join(args.artifacts, label + ".png"), Buffer.from(data, "base64"))
        }
        return value
      }
      const key = async (key, code, virtualKey, modifiers = 0) => {
        await session.send("Input.dispatchKeyEvent", {
          type: "keyDown",
          key,
          code,
          windowsVirtualKeyCode: virtualKey,
          nativeVirtualKeyCode: virtualKey,
          modifiers,
          ...(key === " " ? { text: " ", unmodifiedText: " " } : {}),
        })
        await session.send("Input.dispatchKeyEvent", {
          type: "keyUp",
          key,
          code,
          windowsVirtualKeyCode: virtualKey,
          nativeVirtualKeyCode: virtualKey,
          modifiers,
        })
      }
      const end = async () => {
        await session.evaluate(`${scroll}.focus({ preventScroll: true }); true`)
        await key("End", "End", 35)
        await audit.wait(
          `(() => { const el = ${scroll}; return el.scrollHeight - el.scrollTop - el.clientHeight <= 2 })()`,
          "native End at tail",
        )
        await pause(1500)
      }
      const append = async (label) => {
        const before = await metrics()
        await session.evaluate(
          `window.__markdownProbe.append(${JSON.stringify("\n\n" + "Additional streaming paragraph. ".repeat(180))})`,
        )
        await audit.wait(
          `document.querySelector('[data-scrollbar="chat"]').scrollHeight > ${before.height + 100}`,
          label + " content growth",
        )
        await pause(400)
        return metrics()
      }
      await audit.wait(`document.querySelectorAll('h2').length >= 40`, "long transcript")
      await session.send("Page.bringToFront")
      await audit.wait("document.hasFocus()", "foreground fixture app")
      await end()
      const receipts = []
      for (const theme of ["dark", "light"]) {
        await session.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: theme }] })
        await audit.wait(
          `document.documentElement.classList.contains('dark') === ${theme === "dark"}`,
          theme + " theme",
        )
        await end()
        const atEnd = await metrics()
        await session.send("Input.dispatchMouseEvent", {
          type: "mouseWheel",
          x: atEnd.x + atEnd.width / 2,
          y: atEnd.y + atEnd.viewport / 2,
          deltaX: 0,
          deltaY: -40,
        })
        await audit.wait(`(${scroll}).scrollTop < ${atEnd.top - 5}`, "native upward wheel")
        await pause(1500)
        const held = await capture(theme + "-released-in-bottom-zone")
        if (held.max - held.top <= 2 || held.max - held.top > Math.max(48, held.viewport * 0.1)) {
          throw new Error("Wheel fixture did not stop within bottom spacer: " + JSON.stringify(held))
        }
        const grown = await append(theme + " wheel")
        if (Math.abs(grown.top - held.top) > 2) throw new Error("Streaming moved released wheel position")
        await capture(theme + "-held-after-growth")
        await end()
        const keyStart = await metrics()
        await key(" ", "Space", 32, 8)
        await audit.wait(`(${scroll}).scrollTop < ${keyStart.top - 50}`, "native Shift+Space backward paging")
        await pause(1500)
        const keyHeld = await metrics()
        const keyGrown = await append(theme + " keyboard")
        if (Math.abs(keyGrown.top - keyHeld.top) > 2) throw new Error("Streaming moved Shift+Space position")
        await capture(theme + "-shift-space-held")
        await end()
        const tail = await metrics()
        const thumbHeight = Math.max(20, (tail.viewport * tail.viewport) / tail.height)
        const mouseX = tail.x + tail.width - 5
        const thumbY = tail.y + tail.viewport - thumbHeight / 2
        await session.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: mouseX, y: thumbY })
        await session.send("Input.dispatchMouseEvent", {
          type: "mousePressed",
          button: "left",
          buttons: 1,
          clickCount: 1,
          x: mouseX,
          y: thumbY,
        })
        await session.send("Input.dispatchMouseEvent", {
          type: "mouseMoved",
          button: "left",
          buttons: 1,
          x: mouseX,
          y: tail.y + tail.viewport / 2,
        })
        await session.send("Input.dispatchMouseEvent", {
          type: "mouseReleased",
          button: "left",
          buttons: 0,
          clickCount: 1,
          x: mouseX,
          y: tail.y + tail.viewport / 2,
        })
        await audit.wait(`(${scroll}).scrollTop < ${tail.top - 100}`, "native scrollbar drag")
        await pause(400)
        const dragHeld = await metrics()
        const dragGrown = await append(theme + " drag")
        if (Math.abs(dragGrown.top - dragHeld.top) > 2)
          throw new Error("Streaming moved native scrollbar drag position")
        await capture(theme + "-native-drag-held")
        await end()
        const resumed = await append(theme + " resumed")
        await audit.wait(
          `(() => { const el = ${scroll}; return el.scrollHeight - el.scrollTop - el.clientHeight <= 2 })()`,
          "native follow resumed",
        )
        receipts.push({
          theme,
          wheel: { held, grown },
          keyboard: { held: keyHeld, grown: keyGrown },
          drag: { held: dragHeld, grown: dragGrown },
          resumed: { beforeSettle: resumed, final: await capture(theme + "-following-again") },
        })
      }
      await session.evaluate("window.__markdownProbe.finish()")
      if (args.artifacts)
        await fs.writeFile(
          path.join(args.artifacts, "chat-scroll-receipt.json"),
          JSON.stringify(
            {
              ok: true,
              input: "CDP native wheel, keyboard and scrollbar drag; real Chromium geometry and scroll events",
              receipts,
            },
            null,
            2,
          ),
        )
      return {
        name: "chat-reader-scroll",
        ok: true,
        detail:
          "Native wheel, Shift+Space and scrollbar drag hold through streaming, then End resumes following in light and dark themes",
      }
    },
  ],
})
outcome.lines.forEach((line) => console.log(line))
process.exitCode = outcome.ok ? 0 : 1
