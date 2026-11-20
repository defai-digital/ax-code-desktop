#!/usr/bin/env node
// Qualify the renderer's read-only Git remote capability in a disposable repository.
import fs from "node:fs/promises"
import path from "node:path"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { journeyBoot } from "./journeys.mjs"
import { parseArgs, runHarness } from "./run.mjs"
import { assertPathInsideDirectory } from "./scenario.mjs"
import { SettingsWebMcpAudit } from "./settings-webmcp.mjs"

const args = parseArgs(process.argv.slice(2))
const outcome = await runHarness({
  ...args,
  uiWebMcp: true,
  journeys: [
    journeyBoot,
    async function gitRemoteCapability({ session, e2e }) {
      const directory = e2e.scenario.session.directory
      assertPathInsideDirectory(directory, path.dirname(e2e.stubOriginPath), "Git remote fixture")
      await promisify(execFile)("git", ["init", "--quiet", "--initial-branch=main", directory])
      const profile = {
        id: "qualified-identity",
        name: "Qualified repository identity",
        userName: "Fixture",
        userEmail: "fixture@example.invalid",
        authType: "token",
        host: "example.invalid/qualified/repo",
      }
      const unrelated = {
        ...profile,
        id: "unrelated-identity",
        name: "Unrelated repository identity",
        host: "example.invalid/other/repo",
      }
      const reads = []
      const mutations = []
      const errors = []
      session.on("Fetch.requestPaused", (event) => {
        void (async () => {
          const url = new URL(event.request.url)
          const entry = {
            method: event.request.method,
            pathname: url.pathname,
            directory: url.searchParams.get("directory"),
          }
          const reply = (body) =>
            session.send("Fetch.fulfillRequest", {
              requestId: event.requestId,
              responseCode: 200,
              responseHeaders: [{ name: "Content-Type", value: "application/json" }],
              body: Buffer.from(JSON.stringify(body)).toString("base64"),
            })
          if (entry.method !== "GET") {
            mutations.push(entry)
            await reply({ error: "Read-only qualification" })
            return
          }
          reads.push(entry)
          if (url.pathname.endsWith("/remote-url")) await reply({ url: "https://example.invalid/qualified/repo.git" })
          else if (url.pathname.endsWith("/identities")) await reply([profile, unrelated])
          else if (url.pathname.endsWith("/global-identity") || url.pathname.endsWith("/current-identity"))
            await reply({ userName: null, userEmail: null })
          else if (url.pathname.endsWith("/has-local-identity")) await reply({ hasLocalIdentity: false })
          else await session.send("Fetch.continueRequest", { requestId: event.requestId })
        })().catch((error) => errors.push(error.message))
      })
      await session.send("Fetch.enable", { patterns: [{ urlPattern: "*/api/git/*" }] })
      // Initial boot can cache a negative repository check before the fixture's git init.
      await session.send("Page.reload", { ignoreCache: true })
      await journeyBoot({ session })

      const audit = new SettingsWebMcpAudit(session, args.artifacts)
      await audit.client.enable()
      // The header toggle reopens whichever view the inspector last showed; the rail names the Git view.
      await audit.click("Git", { role: "button" })
      await audit.wait(
        `Boolean(document.querySelector('[aria-label="Git identity: No identity"]'))`,
        "Git header rendered",
      )
      for (const theme of ["dark", "light"]) {
        await audit.click("Settings")
        await audit.page("Appearance")
        await audit.click(theme === "dark" ? "Dark" : "Light")
        await audit.wait(`document.documentElement.classList.contains('${theme}')`, `${theme} theme`)
        await audit.click("Close settings")
        await audit.wait(`!document.querySelector('[data-settings-view]')`, "Settings closed")
        const identity = await audit.find("Git identity: No identity", { role: "button" })
        if (identity.disabled) throw new Error("The repository identity is hidden without the remote capability")
        await audit.click("Git identity: No identity", { role: "button" })
        await audit.wait(
          `document.body.innerText.includes('Qualified repository identity')`,
          "repository-scoped identity offered",
        )
        const offered = (await audit.all()).controls.find(
          (control) => control.role === "menuitem" && control.name.includes(profile.name),
        )
        if (!offered) throw new Error("The matching identity is not an accessible menu item")
        const unrelatedOffered = (await audit.all()).controls.some(
          (control) => control.role === "menuitem" && control.name.includes(unrelated.name),
        )
        if (unrelatedOffered) throw new Error("An unrelated repository identity was offered")

        if (args.artifacts) {
          const inspection = await session.evaluate(
            `({theme:document.documentElement.className,text:document.body.innerText})`,
          )
          await fs.mkdir(args.artifacts, { recursive: true })
          await fs.writeFile(
            path.join(args.artifacts, `git-remote-${theme}.json`),
            JSON.stringify({ state: await audit.all(), inspection }, null, 2),
          )
          const { data } = await session.send("Page.captureScreenshot", { format: "png" })
          await fs.writeFile(path.join(args.artifacts, `git-remote-${theme}.png`), Buffer.from(data, "base64"))
        }
        await session.send("Input.dispatchKeyEvent", {
          type: "keyDown",
          key: "Escape",
          code: "Escape",
          windowsVirtualKeyCode: 27,
        })
        await session.send("Input.dispatchKeyEvent", {
          type: "keyUp",
          key: "Escape",
          code: "Escape",
          windowsVirtualKeyCode: 27,
        })
        await audit.wait(`!document.querySelector('[role="menu"]')`, "identity menu closed without selecting")
      }
      if (!reads.some((read) => read.pathname.endsWith("/remote-url") && read.directory === directory))
        throw new Error("The Git view did not read the actual directory's remote URL")
      if (mutations.length || errors.length) throw new Error(JSON.stringify({ mutations, errors }))
      if (args.artifacts)
        await fs.writeFile(
          path.join(args.artifacts, "remote-read-receipt.json"),
          JSON.stringify({ reads, mutations, errors }, null, 2),
        )
      return {
        name: "git-remote-capability",
        ok: true,
        detail: "Actual Git remote read exposes repository-scoped identity in light/dark; zero Git mutation attempts",
      }
    },
  ],
})
outcome.lines.forEach((line) => console.log(line))
process.exitCode = outcome.ok ? 0 : 1
