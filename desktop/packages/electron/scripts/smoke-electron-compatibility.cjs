"use strict"

// Real native ABI and menu checks in the installed Electron process.
const { app, Menu } = require("electron")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { createNativeLocalizer, localizeMenuTemplate } = require("../src/native-localization")
const manifest = require("../../../shared/locales.json")
const locales = Object.keys(manifest.labels)
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "ax-coder-electron-compatibility-"))
app.setPath("userData", profile)
app.commandLine.appendSwitch("use-mock-keychain")
const timeout = setTimeout(() => app.exit(1), 20000)

app
  .whenReady()
  .then(async () => {
    const declared = require("../package.json").devDependencies.electron
    // An aliased pin (`npm:electron-nightly@…`) names the package, not the version the
    // runtime reports; compare against the installed package in that case.
    const expected = declared.startsWith("npm:") ? require("electron/package.json").version : declared
    assert.equal(process.versions.electron, expected)
    for (const locale of locales) {
      const t = createNativeLocalizer(() => locale)
      const menu = Menu.buildFromTemplate(
        localizeMenuTemplate(
          [
            { label: "Settings", accelerator: "CmdOrCtrl+," },
            { label: "Edit", submenu: [{ role: "undo" }, { role: "hideOthers" }, { role: "togglefullscreen" }] },
          ],
          t,
        ),
      )
      assert.equal(menu.items[0].label, t("Settings"))
      assert.equal(menu.items[1].submenu.items[0].label, t("Undo"))
      assert.equal(menu.items[1].submenu.items[1].label, t("Hide Others"))
      assert.equal(menu.items[0].accelerator, "CmdOrCtrl+,")
    }
    const pty = require("node-pty")
    const marker = "AX_CODER_ELECTRON_PTY_OK"
    const terminal =
      process.platform === "win32"
        ? pty.spawn(process.env.ComSpec || "cmd.exe", ["/d", "/c", `echo ${marker}`], { cols: 80, rows: 24 })
        : pty.spawn("/bin/sh", ["-c", `printf '${marker}\\n'`], { cols: 80, rows: 24 })
    let output = ""
    try {
      await new Promise((resolve, reject) => {
        terminal.onData((data) => {
          output += data
        })
        terminal.onExit(({ exitCode }) => {
          if (exitCode !== 0 || !output.includes(marker)) reject(new Error(`PTY round trip failed (${exitCode})`))
          else resolve()
        })
      })
    } finally {
      try {
        terminal.kill()
      } catch {
        /* The child normally already exited. */
      }
    }
    console.log(
      JSON.stringify({
        electron: process.versions.electron,
        chromium: process.versions.chrome,
        node: process.versions.node,
        abi: process.versions.modules,
        platform: process.platform,
        arch: process.arch,
        nativeMenus: locales.length,
        ptyRoundTrip: true,
        productionQualified: false,
      }),
    )
  })
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => {
    clearTimeout(timeout)
    try {
      fs.rmSync(profile, { recursive: true, force: true })
    } catch {
      /* Files can remain locked until exit. */
    }
    app.exit(process.exitCode || 0)
  })
