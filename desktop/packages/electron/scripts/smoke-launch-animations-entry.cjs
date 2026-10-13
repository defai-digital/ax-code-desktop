"use strict"
const { app, BrowserWindow, ipcMain, protocol } = require("electron")
const fs = require("node:fs/promises")
const path = require("node:path")
const fsSync = require("node:fs")
const { createLaunchAnimationController, ANIMATION_PRIVILEGED_SCHEMES } = require("../src/launch-animation-controller")
const manifest = require("../resources/launch-animations/manifest.json")

protocol.registerSchemesAsPrivileged(ANIMATION_PRIVILEGED_SCHEMES)
app.commandLine.appendSwitch("use-mock-keychain")
const reducedMotionCase = process.env.AX_ANIMATION_SMOKE_MEDIA === "reduce"
// Set the renderer preference before startup, without navigating a hidden
// player through about:blank or attaching the debugger during playback.
app.commandLine.appendSwitch(reducedMotionCase ? "force-prefers-reduced-motion" : "force-prefers-no-reduced-motion")
app.name = "AX Code Animation Smoke"
fsSync.mkdirSync(process.env.AX_ANIMATION_SMOKE_DATA_DIR, { recursive: true })
app.setPath("userData", process.env.AX_ANIMATION_SMOKE_DATA_DIR)
app.on("window-all-closed", () => {})

app
  .whenReady()
  .then(async () => {
    const results = []
    for (const index of reducedMotionCase ? [] : [0, 1, 35]) {
      const controller = createLaunchAnimationController({
        BrowserWindow,
        ipcMain,
        manifest,
        assetDir: path.join(__dirname, "../dist/launch-animations"),
        preloadPath: path.join(__dirname, "../dist/launch-animation-preload.js"),
        env: {},
        showWindow: false,
        random: () => (index + 0.5) / manifest.pairs.length,
      })
      for (const kind of ["opening", "ending"]) {
        const playing = kind === "opening" ? controller.playOpening() : controller.playEnding()
        if (index === 35 && process.env.AX_ANIMATION_SMOKE_EVIDENCE) {
          await new Promise((resolve) => setTimeout(resolve, 1400))
          if (!controller.window) throw new Error("Player closed before visual capture")
          const screenshot = await controller.window.webContents.capturePage()
          await fs.writeFile(path.join(process.env.AX_ANIMATION_SMOKE_EVIDENCE, `${kind}.png`), screenshot.toPNG())
        }
        const result = await playing
        results.push(result)
        if (result.reason !== "ended" || result.frames < 2)
          throw new Error(`Video did not decode and finish: ${JSON.stringify(result)}`)
      }
      controller.dispose()
    }
    let reducedMotion
    if (reducedMotionCase) {
      const controller = createLaunchAnimationController({
        BrowserWindow,
        ipcMain,
        manifest,
        assetDir: path.join(__dirname, "../dist/launch-animations"),
        preloadPath: path.join(__dirname, "../dist/launch-animation-preload.js"),
        env: {},
        showWindow: false,
        random: () => 0,
      })
      reducedMotion = await controller.playOpening()
      controller.dispose()
      if (reducedMotion.reason !== "reduced-motion" || reducedMotion.frames !== 0)
        throw new Error("The production player did not respect reduced motion")
    }
    await fs.writeFile(process.env.AX_ANIMATION_SMOKE_OUTPUT, JSON.stringify({ results, reducedMotion }, null, 2))
    app.exit(0)
  })
  .catch((error) => {
    console.error(error)
    app.exit(1)
  })
