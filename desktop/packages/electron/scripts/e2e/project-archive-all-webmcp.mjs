#!/usr/bin/env node
// Project-wide Archive all against the isolated stub runtime; no provider execution.
import fs from "node:fs/promises"
import path from "node:path"
import { waitForCondition } from "./cdp.mjs"
import { journeyBoot } from "./journeys.mjs"
import { mentionsPath, pathForms } from "./paths.mjs"
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
    async function journeyProjectArchiveAll({ session, e2e }) {
      const origin = parseStubOrigin(await fs.readFile(e2e.stubOriginPath, "utf8"))
      const projects = [e2e.scenario.project, e2e.scenario.portfolio[0].project]
      const seeded = new Map([
        [projects[0].id, [e2e.scenario.session.id]],
        [projects[1].id, [e2e.scenario.portfolio[0].session.id]],
      ])
      let createdCount = 0
      const createSessions = async (project, count) => {
        for (let index = 0; index < count; index += 1) {
          const response = await fetch(`${origin}/session?directory=${encodeURIComponent(project.worktree)}`, {
            redirect: "error",
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ title: `Archive fixture ${project.id} ${index + 1}` }),
          })
          if (!response.ok) throw new Error(`Could not seed a session for ${project.id}`)
          const expectedId = `ses_e2e_created_${++createdCount}`
          if ((await response.json()).id !== expectedId) throw new Error("Unexpected created fixture session")
          seeded.get(project.id).push(expectedId)
        }
      }
      await createSessions(projects[0], 2)
      await createSessions(projects[1], 2)
      const resetFixture = await fetch(`${origin}/__e2e__/session-archives`, {
        redirect: "error",
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ archived: [] }),
      })
      if (!resetFixture.ok) throw new Error("Could not reset the archive fixture")
      await session.send("Page.reload", { ignoreCache: true })
      await journeyBoot({ session })
      const audit = new SettingsWebMcpAudit(session, args.artifacts)
      await audit.client.enable()
      const fixture = async () => (await fetch(`${origin}/__e2e__/session-archives`, { redirect: "error" })).json()
      const capture = async (name) => {
        const state = await audit.all()
        const inspection = await session.evaluate(`(() => ({
        rows: Array.from(document.querySelectorAll('[data-session-row]')).map(row => ({
          id: row.dataset.sessionRow, archived: row.dataset.sessionArchived, text: row.innerText,
        })),
        headers: Array.from(document.querySelectorAll('[data-project-header]')).map(button => ({
          id: button.dataset.projectHeader, name: button.getAttribute('aria-label'),
          expanded: button.getAttribute('aria-expanded'),
        })),
        dialog: document.querySelector('[role="dialog"]')?.innerText ?? null,
        toast: document.querySelector('[data-sonner-toast]')?.innerText ?? null,
      }))()`)
        if (args.artifacts) {
          await fs.mkdir(args.artifacts, { recursive: true })
          await fs.writeFile(
            path.join(args.artifacts, `${name}.json`),
            `${JSON.stringify({ state, inspection }, null, 2)}\n`,
          )
          const { data } = await session.send("Page.captureScreenshot", { format: "png" })
          await fs.writeFile(path.join(args.artifacts, `${name}.png`), Buffer.from(data, "base64"))
        }
        return { state, inspection }
      }
      const menuTrigger = async (project) => {
        const matches = (await audit.all()).controls.filter(
          (control) =>
            control.role === "button" &&
            control.name.startsWith("Project menu") &&
            mentionsPath(control.name, project.worktree),
        )
        if (matches.length !== 1)
          throw new Error(`Expected one project menu for ${project.id}, found ${matches.length}`)
        return matches[0]
      }
      const openMenu = async (project) => {
        await audit.click((await menuTrigger(project)).name, { role: "button" })
        await waitForCondition(
          async () => Boolean(await audit.find("Archive all", { role: "menuitem", optional: true })),
          { timeoutMs: 10_000, label: "Archive all menu item" },
        )
        return audit.find("Archive all", { role: "menuitem" })
      }
      const waitEnabled = async (label) =>
        waitForCondition(
          async () => {
            const item = await audit.find("Archive all", { role: "menuitem", optional: true })
            return Boolean(item) && !item.disabled
          },
          { timeoutMs: 20_000, label },
        )
      const confirmOpen = async (project, count) => {
        await waitEnabled(`${project.id} archive readiness`)
        await audit.click("Archive all", { role: "menuitem" })
        await audit.wait(
          `document.querySelector('[role="dialog"]')?.innerText.includes("Archive sessions?")`,
          "archive confirmation",
        )
        const text = await session.evaluate(`document.querySelector('[role="dialog"]')?.innerText ?? ""`)
        if (!text.includes(`All ${count} sessions in`)) throw new Error("Archive confirmation count is wrong")
        if (!mentionsPath(text, project.worktree)) throw new Error("Archive confirmation names the wrong project")
      }
      const rowsArchived = (ids, archived, label) =>
        audit.wait(
          `${JSON.stringify(ids)}.every(id => {
        const row = document.querySelector('[data-session-row="' + id + '"]')
        return Boolean(row) && row.dataset.sessionArchived === ${JSON.stringify(archived)}
      })`,
          label,
        )
      const activeWrites = (state, ids) =>
        state.writes.filter((write) => ids.includes(write.sessionID) && typeof write.archived === "number")
      const restoredWrites = (state, ids) =>
        state.writes.filter((write) => ids.includes(write.sessionID) && write.archived === null)
      const assertDirectories = (writes, project) => {
        const forms = pathForms(project.worktree)
        if (writes.some((write) => !forms.includes(write.directory)))
          throw new Error(`Archive request left ${project.id}`)
      }
      await audit.wait('document.querySelectorAll("[data-project-header]").length >= 2', "two project headers")
      await audit.wait(
        `${JSON.stringify(seeded.get(projects[0].id))}.every(id => Boolean(document.querySelector('[data-session-row="' + id + '"]')))`,
        "seeded rows",
      )
      await capture("archive-initial")
      // Cancel must leave both projects untouched.
      await openMenu(projects[0])
      await waitEnabled("initial archive readiness")
      await audit.click("Archive all", { role: "menuitem" })
      await audit.wait(
        'document.querySelector(\'[role="dialog"]\')?.innerText.includes("Archive sessions?")',
        "archive confirmation",
      )
      await audit.click("Cancel", { role: "button" })
      await audit.wait("!document.querySelector('[role=\"dialog\"]')", "confirmation closed")
      await new Promise((resolve) => setTimeout(resolve, 250))
      if ((await fixture()).writes.length !== 0) throw new Error("Cancel wrote archive state")
      // Confirm archives exactly the project's live sessions.
      await openMenu(projects[0])
      await confirmOpen(projects[0], seeded.get(projects[0].id).length)
      await audit.click("Archive", { role: "button" })
      const archiveIds = seeded.get(projects[0].id)
      await waitForCondition(async () => activeWrites(await fixture(), archiveIds).length === archiveIds.length, {
        timeoutMs: 20_000,
        label: "one archive request per session",
      })
      const afterArchive = await fixture()
      const archiveWrites = activeWrites(afterArchive, archiveIds)
      for (const id of archiveIds) {
        if (archiveWrites.filter((write) => write.sessionID === id).length !== 1) {
          throw new Error(`Expected one archive request for ${id}`)
        }
      }
      assertDirectories(archiveWrites, projects[0])
      if (afterArchive.writes.some((write) => seeded.get(projects[1].id).includes(write.sessionID))) {
        throw new Error("Archive all reached another project")
      }
      await audit.wait(
        `document.querySelector('[data-sonner-toast]')?.innerText.includes("Archived ${archiveIds.length} sessions")`,
        "archive toast",
      )
      await rowsArchived(archiveIds, "1", "archived rows leave the active list")
      await capture("archive-done")
      // Undo restores every successfully archived session and no archived state remains.
      await audit.click("Undo", { role: "button" })
      await waitForCondition(async () => restoredWrites(await fixture(), archiveIds).length === archiveIds.length, {
        timeoutMs: 20_000,
        label: "one restore request per session",
      })
      const afterUndo = await fixture()
      assertDirectories(restoredWrites(afterUndo, archiveIds), projects[0])
      if (afterUndo.archived.some((entry) => archiveIds.includes(entry.id)))
        throw new Error("Undo left archived state behind")
      await rowsArchived(archiveIds, "0", "rows restored to the active list")
      await capture("archive-undone")
      // A different project archives only its own sessions and then has nothing left to act on.
      const otherIds = seeded.get(projects[1].id)
      await openMenu(projects[1])
      await confirmOpen(projects[1], otherIds.length)
      await audit.click("Archive", { role: "button" })
      await waitForCondition(async () => activeWrites(await fixture(), otherIds).length === otherIds.length, {
        timeoutMs: 20_000,
        label: "other project archive requests",
      })
      const afterOther = await fixture()
      assertDirectories(activeWrites(afterOther, otherIds), projects[1])
      if (
        afterOther.writes.filter((write) => archiveIds.includes(write.sessionID) && typeof write.archived === "number")
          .length !== archiveIds.length
      ) {
        throw new Error("Other project changed the first project's archive requests")
      }
      await rowsArchived(otherIds, "1", "other project rows archived")
      await rowsArchived(archiveIds, "0", "first project rows stay active")
      await openMenu(projects[1])
      const exhausted = await audit.find("Archive all", { role: "menuitem" })
      if (!exhausted.disabled) throw new Error("Archive all stays enabled when every session is archived")
      await capture("archive-other-project")
      if (args.artifacts) {
        await fs.writeFile(
          path.join(args.artifacts, "archive-receipt.json"),
          JSON.stringify(
            {
              seeded: Object.fromEntries(seeded),
              // The checks above proved these local expected counts against the server.
              verifiedWriteCounts: {
                archived: archiveIds.length,
                restored: archiveIds.length,
                otherProjectArchived: otherIds.length,
              },
              actions: audit.calls,
            },
            null,
            2,
          ),
        )
      }
      // A project with exactly one live session must use singular copy, not "All 1 sessions".
      const singularArchives = archiveIds.slice(1).map((id) => ({ id, archived: Date.now() }))
      const seededArchives = await fetch(`${origin}/__e2e__/session-archives`, {
        redirect: "error",
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ archived: singularArchives }),
      })
      if (!seededArchives.ok) throw new Error("Could not seed an archived-only project state")
      await session.send("Page.reload", { ignoreCache: true })
      await journeyBoot({ session })
      await audit.client.enable()
      await rowsArchived([archiveIds[0]], "0", "single live session remains")
      await openMenu(projects[0])
      await waitEnabled("single-session archive readiness")
      await audit.click("Archive all", { role: "menuitem" })
      await audit.wait(
        `document.querySelector('[role="dialog"]')?.innerText.includes("The session in")`,
        "singular project description",
      )
      const singularText = await session.evaluate(`document.querySelector('[role="dialog"]')?.innerText ?? ""`)
      if (!mentionsPath(singularText, projects[0].worktree))
        throw new Error("Singular description names the wrong project")
      if (singularText.includes("All 1 sessions")) throw new Error("Singular description uses plural copy")
      await capture("archive-singular")
      await audit.click("Cancel", { role: "button" })
      await audit.wait("!document.querySelector('[role=\"dialog\"]')", "singular confirmation closed")
      return {
        name: "project-archive-all",
        ok: true,
        detail:
          "Archive all scopes to its project, confirms the frozen count, cancels without writes, archives and undoes exact membership, and disables itself with no live session",
      }
    },
  ],
})
for (const line of outcome.lines) console.log(line)
process.exitCode = outcome.ok ? 0 : 1
