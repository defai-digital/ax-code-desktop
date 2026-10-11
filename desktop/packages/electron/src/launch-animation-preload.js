"use strict"
const { contextBridge, ipcRenderer } = require("electron")
const reasons = new Set(["ended", "skip", "disabled", "reduced-motion", "error"])
contextBridge.exposeInMainWorld("launchAnimation", {
  finish: (reason, frames) => {
    if (!reasons.has(reason)) return
    ipcRenderer.send("ax-code:launch-animation-done", {
      reason,
      frames: Number.isSafeInteger(frames) && frames >= 0 ? frames : 0,
    })
  },
})
