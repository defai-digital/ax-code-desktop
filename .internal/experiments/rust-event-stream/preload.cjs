const { contextBridge, ipcRenderer } = require("electron")
contextBridge.exposeInMainWorld("fixture", {
  start: () => ipcRenderer.send("fixture:start"),
  ack: (sequence, cursor) => ipcRenderer.send("fixture:ack", sequence, cursor),
  finished: (result) => ipcRenderer.send("fixture:finished", result),
  onBatch: (handler) => {
    const listener = (_event, sequence, batch) => handler(sequence, batch)
    ipcRenderer.on("fixture:batch", listener)
    return () => ipcRenderer.removeListener("fixture:batch", listener)
  },
})
