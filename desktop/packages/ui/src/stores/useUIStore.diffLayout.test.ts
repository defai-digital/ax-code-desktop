import { beforeEach, describe, expect, test } from "vitest"

import { useUIStore } from "./useUIStore"

beforeEach(() => {
  useUIStore.setState({ diffLayoutPreference: "inline", diffFileLayout: {} })
})

describe("useUIStore diff layout", () => {
  test("the layout for all files becomes the setting and drops the per-file choices", () => {
    // The Changes header used to write an override for the files on screen only: the setting stayed at its old
    // value, so a file that appeared later — or another session, or the next launch — opened inline again while
    // Appearance still showed the old choice.
    useUIStore.getState().setDiffFileLayout("a.ts", "inline")
    useUIStore.getState().setDiffFileLayout("b.ts", "side-by-side")

    useUIStore.getState().setDiffLayoutForAllFiles("side-by-side")

    expect(useUIStore.getState().diffLayoutPreference).toBe("side-by-side")
    expect(useUIStore.getState().diffFileLayout).toEqual({})
  })

  test("choosing the layout already set still drops the per-file choices that differ", () => {
    useUIStore.setState({ diffLayoutPreference: "side-by-side" })
    useUIStore.getState().setDiffFileLayout("a.ts", "inline")

    useUIStore.getState().setDiffLayoutForAllFiles("side-by-side")

    expect(useUIStore.getState().diffFileLayout).toEqual({})
  })

  test("the setting alone keeps the per-file choices", () => {
    useUIStore.getState().setDiffFileLayout("a.ts", "inline")

    useUIStore.getState().setDiffLayoutPreference("side-by-side")

    expect(useUIStore.getState().diffFileLayout).toEqual({ "a.ts": "inline" })
  })
})
