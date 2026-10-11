"use strict"

// Startup recovery for a missing ax-code runtime. A packaged build ships a
// pinned runtime, but dev builds, unstaged builds, and damaged installs can
// resolve nothing. Instead of exiting after an error box, let the user point
// the app at an installed CLI (persisted as settings.axCodeBinary), open the
// install guide, or quit. Returns "retry" once a usable path was saved and
// "quit" otherwise; the caller re-runs binary resolution on "retry".

async function recoverFromMissingRuntime({
  dialog,
  openExternal,
  installDocsUrl,
  isExecutable,
  saveBinaryPath,
  parentWindow,
  logger = console,
}) {
  const withParent = (options) => (parentWindow ? [parentWindow, options] : [options])

  for (;;) {
    const { response } = await dialog.showMessageBox(
      ...withParent({
        type: "warning",
        title: "AX Code runtime not found",
        message: "AX Code could not find its agent runtime.",
        detail:
          "Choose an installed ax-code executable, or install it first and then choose it. " +
          "Your choice is saved in settings.axCodeBinary.",
        buttons: ["Choose ax-code…", "Open install guide", "Quit"],
        defaultId: 0,
        cancelId: 2,
        noLink: true,
      }),
    )

    if (response === 1) {
      try {
        await openExternal(installDocsUrl)
      } catch (error) {
        logger.warn("[electron] failed to open the ax-code install guide:", error)
      }
      continue
    }
    if (response !== 0) return "quit"

    const picked = await dialog.showOpenDialog(
      ...withParent({
        title: "Choose the ax-code executable",
        properties: ["openFile"],
        buttonLabel: "Use this ax-code",
      }),
    )
    const filePath = picked.canceled ? null : picked.filePaths[0]
    if (!filePath) continue

    if (!isExecutable(filePath)) {
      await dialog.showMessageBox(
        ...withParent({
          type: "error",
          title: "Not an executable file",
          message: "That file cannot be run.",
          detail: filePath,
          buttons: ["OK"],
        }),
      )
      continue
    }

    await saveBinaryPath(filePath)
    return "retry"
  }
}

module.exports = { recoverFromMissingRuntime }
