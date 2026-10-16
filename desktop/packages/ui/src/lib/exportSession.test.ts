import { describe, expect, test } from "vitest"

import { shouldDownloadInsteadOfSaving } from "./exportSession"

describe("export save fallback", () => {
  test("downloads only when the shell cannot save at all", () => {
    // A cancelled dialog and a failed write both used to reach the download branch: the user
    // who cancelled got a second copy of the export and a success toast for a file that was
    // never written.
    expect(shouldDownloadInsteadOfSaving("unavailable")).toBe(true)
    expect(shouldDownloadInsteadOfSaving("cancelled")).toBe(false)
    expect(shouldDownloadInsteadOfSaving("failed")).toBe(false)
  })
})
