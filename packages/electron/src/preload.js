'use strict'

const { contextBridge, ipcRenderer } = require('electron')

// Signal to the UI that it's running inside the Electron shell.
// Detected by isElectronShell() in packages/ui/src/lib/desktop.ts.
contextBridge.exposeInMainWorld('__OPENCHAMBER_ELECTRON__', {
  runtime: 'electron',
})

// Tauri-compatible IPC shim.
// The existing desktop.ts helpers call window.__TAURI__.core.invoke(cmd, args).
// We map those calls to Electron ipcRenderer.invoke() so the same code path
// works in both Tauri and Electron without changes to the shared UI package.
contextBridge.exposeInMainWorld('__TAURI__', {
  core: {
    invoke: (command, args) => ipcRenderer.invoke(command, args ?? {}),
  },
})
