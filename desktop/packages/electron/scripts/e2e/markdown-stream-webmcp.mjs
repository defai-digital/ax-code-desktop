#!/usr/bin/env node
// Native UI navigation, real Markdown Worker and renderer-only streaming fixtures.
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
    async function journeyMarkdownStream({ session, e2e }) {
      await session.send("Page.addScriptToEvaluateOnNewDocument", {
        source: `(() => {
      window.__markdownProbe = { sockets: [], requests: [], responses: [] }
      const probe = window.__markdownProbe
      window.WebSocket = new Proxy(window.WebSocket, { construct(target, args) {
        const socket = new target(...args)
        probe.sockets.push({ url: String(args[0]), socket })
        return socket
      } })
      window.Worker = new Proxy(window.Worker, { construct(target, args) {
        const worker = new target(...args)
        if (String(args[0]).includes('markdownParser')) {
          const started = new Map()
          const post = worker.postMessage.bind(worker)
          worker.postMessage = (...values) => {
            const input = values[0]
            started.set(input.id, performance.now())
            probe.requests.push({ id: input.id, live: input.live, characters: input.text.length })
            return post(...values)
          }
          worker.addEventListener('message', ({ data }) => {
            probe.responses.push({ id: data.id, blocks: data.blocks?.length,
              stablePrefixCount: data.stablePrefixCount ?? 0, elapsedMs: performance.now() - started.get(data.id) })
            started.delete(data.id)
          })
        }
        return worker
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
      const headingCount =
        'Array.from(document.querySelectorAll("h2")).filter(x => /^Markdown section \\d+$/.test(x.textContent)).length'
      await audit.wait(`${headingCount} === 40`, "initial parsed headings")
      await audit.wait(
        "window.__markdownProbe.requests.some(x => x.live && x.characters > 16384)",
        "live worker request",
      )
      await session.evaluate('window.__markdownProbe.append(" APPEND_CONFIRMED")')
      await audit.wait('document.body.innerText.includes("APPEND_CONFIRMED")', "appended text painted")
      await audit.wait(
        "window.__markdownProbe.responses.some(x => x.stablePrefixCount > 0)",
        "incremental worker response",
      )
      if ((await session.evaluate(headingCount)) !== 40) throw new Error("CRLF append duplicated headings")
      const referenceText = "\n\nSee [a\\]b].\n\n[a\\]b]: https://example.com/escaped-reference\n\nReference tail"
      await session.evaluate(`window.__markdownProbe.append(${JSON.stringify(referenceText)})`)
      const referenceLink = 'Array.from(document.querySelectorAll("a")).some(a => a.href === "https://example.com/escaped-reference" && a.textContent === "a]b")'
      await audit.wait(referenceLink, "escaped reference link painted while streaming")
      await session.evaluate("window.__markdownProbe.finish()")
      await audit.wait("window.__markdownProbe.requests.some(x => !x.live)", "final worker request")
      await audit.wait(
        "window.__markdownProbe.requests.some(request => !request.live && window.__markdownProbe.responses.some(response => response.id === request.id && response.blocks > 0))",
        "final worker response",
      )
      await audit.wait(
        `${headingCount} === 40 && document.body.innerText.includes("APPEND_CONFIRMED")`,
        "final parsed document",
      )
      const receipt = {
        escapedReferenceLink: await session.evaluate(referenceLink),
        headings: await session.evaluate(headingCount),
        headingTexts: await session.evaluate(
          'Array.from(document.querySelectorAll("h2")).map(x => x.textContent).filter(text => /^Markdown section \\d+$/.test(text))',
        ),
        worker: await session.evaluate(
          "({ requests: window.__markdownProbe.requests, responses: window.__markdownProbe.responses })",
        ),
        controls: (await audit.all()).controls,
      }
      if (receipt.headingTexts.some((text, index) => text !== `Markdown section ${index}`)) {
        throw new Error("Markdown headings were duplicated, omitted or reordered")
      }
      if (args.artifacts) {
        await fs.mkdir(args.artifacts, { recursive: true })
        await fs.writeFile(path.join(args.artifacts, "markdown-receipt.json"), JSON.stringify(receipt, null, 2))
        for (const theme of ["dark", "light"]) {
          await session.send("Emulation.setEmulatedMedia", {
            features: [{ name: "prefers-color-scheme", value: theme }],
          })
          await audit.wait(
            `document.documentElement.classList.contains("dark") === ${theme === "dark"}`,
            `${theme} theme`,
          )
          await session.evaluate(
            'Array.from(document.querySelectorAll("h2")).find(x => x.textContent === "Markdown section 0")?.scrollIntoView({ block: "center" })',
          )
          const { data } = await session.send("Page.captureScreenshot", { format: "png" })
          await fs.writeFile(path.join(args.artifacts, `markdown-${theme}.png`), Buffer.from(data, "base64"))
        }
        await session.send("Emulation.setEmulatedMedia", { features: [] })
      }
      return {
        name: "markdown-stream",
        ok: true,
        detail: "CRLF live Worker append/finalization, 40 unique headings, native WebMCP navigation and theme captures",
      }
    },
  ],
})
outcome.lines.forEach((line) => console.log(line))
process.exitCode = outcome.ok ? 0 : 1
