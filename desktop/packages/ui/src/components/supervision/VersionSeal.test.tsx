import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test } from "vitest"

import { I18nProvider } from "@/lib/i18n"
import { dict } from "@/lib/i18n/messages/en"
import type { EvidenceSeal } from "@/lib/supervision/evidenceSeal"

import { StatusMark, type StatusMarkKind } from "./StatusMark"
import { VersionSeal } from "./VersionSeal"

describe("VersionSeal", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  const render = (seal: EvidenceSeal) => {
    act(() =>
      root.render(
        <I18nProvider>
          <VersionSeal seal={seal} />
        </I18nProvider>,
      ),
    )
    return container.querySelector<HTMLElement>("[data-version-seal]")
  }

  const fill = (template: string, values: Record<string, string>) =>
    template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? "")

  test("a current seal names the commit the checks ran on and carries no verdict colour", () => {
    const chip = render({ state: "current", reason: "same-commit", head: "b4e19f2", checked: "b4e19f2" })
    expect(chip?.dataset.versionSeal).toBe("current")
    expect(chip?.querySelector("[aria-hidden='true']:not(svg)")?.textContent).toBe(
      `b4e19f2 · ${dict["supervision.seal.word.current"]}`,
    )
    // Desktop proves the commit, not the file contents: no success mark, no success colour.
    expect(chip?.querySelector("[data-status-mark]")?.getAttribute("data-status-mark")).toBe("idle")
    expect(chip?.outerHTML).not.toContain("status-success")
    expect(chip?.querySelector(".sr-only")?.textContent).toBe(
      fill(dict["supervision.seal.reason.sameCommit"], { head: "b4e19f2" }),
    )
  })

  test("checks from different commits show no commit, so HEAD is not presented as what they ran on", () => {
    const chip = render({ state: "stale", reason: "mixed", head: "b4e19f2", checked: null })
    expect(chip?.querySelector("[aria-hidden='true']:not(svg)")?.textContent).toBe(dict["supervision.seal.word.stale"])
  })

  test("a moved HEAD shows both commits, the stale word and a neutral dashed chip", () => {
    const chip = render({ state: "stale", reason: "moved", head: "b71e2c4", checked: "a3f9c1e" })
    expect(chip?.dataset.versionSeal).toBe("stale")
    expect(chip?.querySelector("[aria-hidden='true']:not(svg)")?.textContent).toBe(
      `a3f9c1e → b71e2c4 · ${dict["supervision.seal.word.stale"]}`,
    )
    expect(chip?.className).toContain("border-dashed")
    // Stale is expired, not failed: it never borrows a status colour.
    expect(chip?.outerHTML).not.toMatch(/status-(error|warning|success|info)/)
    expect(chip?.querySelector("[data-status-mark]")?.getAttribute("data-status-mark")).toBe("stale")
    expect(chip?.querySelector<HTMLElement>("[aria-hidden='true']:not(svg)")?.title).toBe(fill(dict["supervision.seal.reason.moved"], { head: "b71e2c4", checked: "a3f9c1e" }))
  })

  test("uncommitted changes are shown as unconfirmable", () => {
    const chip = render({ state: "unverified", reason: "dirty", head: "b4e19f2", checked: "b4e19f2" })
    expect(chip?.dataset.versionSeal).toBe("unverified")
    expect(chip?.textContent).toContain(dict["supervision.seal.word.uncommitted"])
    expect(chip?.querySelector("[data-status-mark]")?.getAttribute("data-status-mark")).toBe("idle")
  })

  test("renders nothing when there is no result to bind to a commit", () => {
    expect(render({ state: "unverified", reason: "none", head: "b4e19f2", checked: null })).toBeNull()
    expect(render({ state: "unverified", reason: "unattributed", head: "b4e19f2", checked: null })).toBeNull()
  })
})

describe("StatusMark", () => {
  test("every state has its own shape, so no two states differ by colour alone", () => {
    const container = document.createElement("div")
    const root = createRoot(container)
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    const kinds: StatusMarkKind[] = ["needs", "review", "failed", "stale", "running", "idle"]
    const shapes = kinds.map((kind) => {
      act(() => root.render(<StatusMark kind={kind} />))
      const svg = container.querySelector("svg")!
      expect(svg.getAttribute("aria-hidden")).toBe("true")
      // Geometry only: strip presentation attributes that carry colour.
      return svg.innerHTML.replace(/ (fill|stroke|opacity)="[^"]*"/g, "")
    })
    act(() => root.unmount())
    expect(new Set(shapes).size).toBe(kinds.length)
  })

  test("stale and idle marks are neutral: expired or resting is never a status colour", () => {
    const container = document.createElement("div")
    const root = createRoot(container)
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    for (const kind of ["stale", "idle"] as const) {
      act(() => root.render(<StatusMark kind={kind} />))
      const svg = container.querySelector("svg")!
      expect(svg.getAttribute("class")).toContain("text-muted-foreground")
      expect(svg.outerHTML).not.toMatch(/--status-|--pr-/)
    }
    act(() => root.render(<StatusMark kind="failed" />))
    expect(container.querySelector("svg")!.getAttribute("class")).toContain("--status-error")
    act(() => root.unmount())
  })
})
