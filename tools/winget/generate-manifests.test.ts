import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { describe, expect, test } from "vitest"
import { generateManifests, parseArgs } from "./generate-manifests"

describe("AX Coder winget manifest generator", () => {
  test("normalizes Desktop versions and rejects unrelated options", () => {
    expect(parseArgs(["--version", "desktop-v7.10.2"]).version).toBe("7.10.2")
    expect(() => parseArgs(["--version", "7.10.2", "--package", "cli"])).toThrow("unknown argument")
    expect(() => parseArgs(["--version", "latest"])).toThrow("semantic version")
  })

  test("writes only Desktop manifests from the frozen release contract", async () => {
    const output = mkdtempSync(path.join(tmpdir(), "ax-coder-winget-"))
    try {
      const result = await generateManifests(["--version", "7.10.2", "--out", output, "--skip-download"])
      const installer = path.join(result.output, "DEFAI.AXCode.Desktop.installer.yaml")
      expect(result).toMatchObject({ repository: "defai-digital/ax-code", tag: "desktop-v7.10.2" })
      expect(existsSync(installer)).toBe(true)
      const source = readFileSync(installer, "utf8")
      expect(source).toContain("AX-Code-7.10.2-win-x64.exe")
      expect(source).toContain("AX-Code-7.10.2-win-arm64.exe")
      expect(source).toContain("/releases/download/desktop-v7.10.2/")
      expect(source).not.toContain("ax-code-windows-x64.zip")
    } finally {
      rmSync(output, { recursive: true, force: true })
    }
  })
})
