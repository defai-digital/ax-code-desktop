import { readFileSync } from "node:fs"
import { describe, expect, test } from "vitest"
import { generatedTypesPath, readContract, renderDesktopIpcTypes } from "./generate-desktop-ipc-types.mjs"

describe("renderDesktopIpcTypes", () => {
  test("maps args and params to TypeScript", () => {
    const output = renderDesktopIpcTypes({
      version: 2,
      commands: [
        { command: "desktop_b", safeForRemote: false, args: "object" },
        { command: "desktop_a", safeForRemote: false, args: "none" },
        {
          command: "desktop_c",
          safeForRemote: false,
          args: "object",
          params: {
            id: { type: "string" },
            mode: { type: "string", enum: ["draft", "session"], optional: true },
            count: { type: "integer", nullable: true },
            tags: { type: "string[]", optional: true },
          },
        },
      ],
    })
    expect(output).toContain("  desktop_a: Record<string, never>\n  desktop_b: Record<string, unknown>\n")
    expect(output).toContain(
      '  desktop_c: {\n    id: string\n    mode?: "draft" | "session"\n    count: number | null\n    tags?: string[]\n  }',
    )
    expect(output).toContain("export type DesktopCommandName = keyof DesktopCommandArgs")
  })

  test("the committed renderer types match the contract", () => {
    expect(readFileSync(generatedTypesPath, "utf8")).toBe(renderDesktopIpcTypes(readContract()))
  })
})
