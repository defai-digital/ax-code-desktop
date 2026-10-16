import React, { act } from "react"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test } from "vitest"

import { useUIStore } from "@/stores/useUIStore"

import { useDefaultDiffViewMode } from "./useDefaultDiffViewMode"

const Probe: React.FC = () => <span data-testid="mode">{useDefaultDiffViewMode()}</span>

describe("useDefaultDiffViewMode", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    useUIStore.setState({ diffLayoutPreference: "inline" })
  })

  const modeFor = (preference: "dynamic" | "inline" | "side-by-side") => {
    useUIStore.setState({ diffLayoutPreference: preference })
    act(() => {
      root.render(<Probe />)
    })
    return container.textContent
  }

  test("opens a diff preview in the layout the setting names", () => {
    // The chat previews hard-coded "unified" and reset to it whenever the preview changed, so a user who picked
    // side-by-side in Appearance still got unified previews here — the same shape upstream fixed in the fork's
    // ancestor (`openchamber 1cd03296e2700f820b64e31fb009d10b1ab7cd6a`).
    expect(modeFor("side-by-side")).toBe("side-by-side")
    expect(modeFor("inline")).toBe("unified")
    // Dynamic stays unified: a preview sits in a column too narrow to split.
    expect(modeFor("dynamic")).toBe("unified")
  })

  test("both diff previews in chat seed and reset from it", async () => {
    // The hook is only worth having if the two previews use it, and their reset effect is what re-applied the
    // hard-coded value when the user moved between previews.
    const sources = await Promise.all(
      ["ToolOutputDialog.tsx", path.join("parts", "ToolPart-impl.tsx")].map((file) =>
        readFile(path.resolve(__dirname, file), "utf8"),
      ),
    )

    for (const source of sources) {
      expect(source).toContain('const defaultDiffViewMode = useDefaultDiffViewMode()')
      expect(source).toContain("useState<DiffViewMode>(defaultDiffViewMode)")
      expect(source).toContain("setDiffViewMode(defaultDiffViewMode)")
      expect(source).not.toContain('React.useState<DiffViewMode>("unified")')
    }
  })
})
