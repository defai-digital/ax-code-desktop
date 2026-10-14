import { describe, expect, it, vi } from "vitest"
import fsPromises from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { createThemeRuntime } from "./theme-runtime.js"

const createRuntime = (overrides = {}) =>
  createThemeRuntime({
    fsPromises: {},
    path: {},
    themesDir: "/themes",
    maxThemeJsonBytes: 20 * 1024,
    logger: {
      warn: vi.fn(),
    },
    ...overrides,
  })

const createValidTheme = (overrides = {}) => ({
  metadata: {
    id: "example-theme",
    name: "Example Theme",
    variant: "dark",
    ...overrides.metadata,
  },
  colors: {
    primary: {
      base: "#111111",
      foreground: "#ffffff",
    },
    surface: {
      background: "#000000",
      foreground: "#ffffff",
      muted: "#222222",
      mutedForeground: "#dddddd",
      elevated: "#111111",
      elevatedForeground: "#ffffff",
      subtle: "#191919",
    },
    interactive: {
      border: "#333333",
      selection: "#444444",
      selectionForeground: "#ffffff",
      focusRing: "#555555",
      hover: "#222222",
    },
    status: {
      error: "#ff0000",
      errorForeground: "#ffffff",
      errorBackground: "#330000",
      errorBorder: "#aa0000",
      warning: "#ffaa00",
      warningForeground: "#000000",
      warningBackground: "#332200",
      warningBorder: "#aa7700",
      success: "#00aa55",
      successForeground: "#ffffff",
      successBackground: "#003322",
      successBorder: "#007744",
      info: "#0088ff",
      infoForeground: "#ffffff",
      infoBackground: "#001f33",
      infoBorder: "#0066aa",
    },
    syntax: {
      base: {
        background: "#000000",
        foreground: "#ffffff",
        keyword: "#ff77aa",
        string: "#99dd99",
        number: "#ffaa55",
        function: "#77aaff",
        variable: "#ffffff",
        type: "#cc99ff",
        comment: "#888888",
        operator: "#dddddd",
      },
      highlights: {
        diffAdded: "#003300",
        diffRemoved: "#330000",
        lineNumber: "#777777",
      },
    },
    ...overrides.colors,
  },
})

describe("theme runtime", () => {
  it("trims normalized metadata fields and filters blank tags", () => {
    const runtime = createRuntime()

    const normalized = runtime.normalizeThemeJson(
      createValidTheme({
        metadata: {
          id: " example-theme ",
          name: " Example Theme ",
          version: " 2.0.0 ",
          tags: ["  dark  ", " ", "editor"],
        },
      }),
    )

    expect(normalized?.metadata).toMatchObject({
      id: "example-theme",
      name: "Example Theme",
      version: "2.0.0",
      tags: ["dark", "editor"],
    })
  })

  it("defaults blank theme versions", () => {
    const runtime = createRuntime()

    const normalized = runtime.normalizeThemeJson(
      createValidTheme({
        metadata: {
          version: "   ",
        },
      }),
    )

    expect(normalized?.metadata.version).toBe("1.0.0")
  })

  it("rejects themes with blank required colors", () => {
    const runtime = createRuntime()

    expect(
      runtime.normalizeThemeJson(
        createValidTheme({
          colors: {
            primary: {
              base: "   ",
              foreground: "#ffffff",
            },
          },
        }),
      ),
    ).toBeNull()
  })

  it("writes a normalized generated theme atomically", async () => {
    const themesDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), "ax-theme-write-"))
    try {
      const runtime = createRuntime({ fsPromises, path, themesDir })
      const theme = createValidTheme({ metadata: { id: "generated-ocean" } })

      const normalized = await runtime.writeCustomThemeToDisk(theme)

      expect(normalized.metadata.id).toBe("generated-ocean")
      expect(JSON.parse(await fsPromises.readFile(path.join(themesDir, "generated-ocean.json"), "utf8"))).toEqual(
        normalized,
      )
      expect(await fsPromises.readdir(themesDir)).toEqual(["generated-ocean.json"])
    } finally {
      await fsPromises.rm(themesDir, { recursive: true, force: true })
    }
  })

  it("only writes ids matching the generated theme rule", async () => {
    const themesDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), "ax-theme-id-"))
    try {
      const runtime = createRuntime({ fsPromises, path, themesDir })
      await expect(runtime.writeCustomThemeToDisk(createValidTheme())).rejects.toThrow("generated theme id")
      expect(await fsPromises.readdir(themesDir)).toEqual([])
    } finally {
      await fsPromises.rm(themesDir, { recursive: true, force: true })
    }
  })

  it("rejects serialized themes larger than the configured byte limit", async () => {
    const themesDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), "ax-theme-size-"))
    try {
      const runtime = createRuntime({ fsPromises, path, themesDir, maxThemeJsonBytes: 20 })
      await expect(
        runtime.writeCustomThemeToDisk(createValidTheme({ metadata: { id: "generated-large" } })),
      ).rejects.toThrow("size limit")
      expect(await fsPromises.readdir(themesDir)).toEqual([])
    } finally {
      await fsPromises.rm(themesDir, { recursive: true, force: true })
    }
  })

  it("refuses to overwrite a file whose theme id differs", async () => {
    const themesDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), "ax-theme-collision-"))
    try {
      await fsPromises.writeFile(
        path.join(themesDir, "generated-ocean.json"),
        JSON.stringify({ metadata: { id: "other" } }),
      )
      const runtime = createRuntime({ fsPromises, path, themesDir })
      await expect(
        runtime.writeCustomThemeToDisk(createValidTheme({ metadata: { id: "generated-ocean" } })),
      ).rejects.toThrow("different id")
      expect(await fsPromises.readdir(themesDir)).toEqual(["generated-ocean.json"])
    } finally {
      await fsPromises.rm(themesDir, { recursive: true, force: true })
    }
  })

  it("rejects generated themes whose values could inject CSS", async () => {
    const themesDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), "ax-theme-values-"))
    try {
      const runtime = createRuntime({ fsPromises, path, themesDir })
      const injected = createValidTheme({ metadata: { id: "generated-bad" } })
      injected.colors.primary.base = "red; } body { display: none"
      await expect(runtime.writeCustomThemeToDisk(injected)).rejects.toThrow("hex colour")

      const badChart = createValidTheme({ metadata: { id: "generated-chart" } })
      badChart.colors.charts = { series: ["#112233", "url(javascript:alert(1))"] }
      await expect(runtime.writeCustomThemeToDisk(badChart)).rejects.toThrow("hex colour")

      const badFont = {
        ...createValidTheme({ metadata: { id: "generated-font" } }),
        config: { fonts: { sans: "x; } *{" } },
      }
      await expect(runtime.writeCustomThemeToDisk(badFont)).rejects.toThrow("font")
      expect(await fsPromises.readdir(themesDir)).toEqual([])
    } finally {
      await fsPromises.rm(themesDir, { recursive: true, force: true })
    }
  })

  it("replaces a corrupt file under a generated name", async () => {
    const themesDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), "ax-theme-corrupt-"))
    try {
      await fsPromises.writeFile(path.join(themesDir, "generated-ocean.json"), "{ not json")
      const runtime = createRuntime({ fsPromises, path, themesDir })
      const normalized = await runtime.writeCustomThemeToDisk(createValidTheme({ metadata: { id: "generated-ocean" } }))
      expect(JSON.parse(await fsPromises.readFile(path.join(themesDir, "generated-ocean.json"), "utf8"))).toEqual(
        normalized,
      )
    } finally {
      await fsPromises.rm(themesDir, { recursive: true, force: true })
    }
  })

  it("runs concurrent saves one at a time", async () => {
    const themesDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), "ax-theme-queue-"))
    try {
      let active = 0
      let maxActive = 0
      const runtime = createRuntime({
        fsPromises: {
          ...fsPromises,
          writeFile: async (...args) => {
            active += 1
            maxActive = Math.max(maxActive, active)
            await new Promise((resolve) => setTimeout(resolve, 10))
            try {
              return await fsPromises.writeFile(...args)
            } finally {
              active -= 1
            }
          },
        },
        path,
        themesDir,
      })
      await Promise.all([
        runtime.writeCustomThemeToDisk(createValidTheme({ metadata: { id: "generated-a" } })),
        runtime.writeCustomThemeToDisk(createValidTheme({ metadata: { id: "generated-b" } })),
        runtime.writeCustomThemeToDisk(createValidTheme({ metadata: { id: "generated-c" } })),
      ])
      expect(maxActive).toBe(1)
      expect((await fsPromises.readdir(themesDir)).sort()).toEqual([
        "generated-a.json",
        "generated-b.json",
        "generated-c.json",
      ])
    } finally {
      await fsPromises.rm(themesDir, { recursive: true, force: true })
    }
  })

  it("cleans up the temporary file when atomic rename fails", async () => {
    const themesDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), "ax-theme-rename-"))
    try {
      const runtime = createRuntime({
        fsPromises: {
          ...fsPromises,
          rename: vi.fn(async () => {
            throw new Error("rename failed")
          }),
        },
        path,
        themesDir,
      })
      await expect(
        runtime.writeCustomThemeToDisk(createValidTheme({ metadata: { id: "generated-ocean" } })),
      ).rejects.toThrow("rename failed")
      expect(await fsPromises.readdir(themesDir)).toEqual([])
    } finally {
      await fsPromises.rm(themesDir, { recursive: true, force: true })
    }
  })
})
